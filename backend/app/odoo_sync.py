"""Versioned inbound projection and an outbox committed with app business records."""
import base64
import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import event, or_, select, update
from sqlalchemy.orm import Session

from .app_commerce import digest, utc
from .config import get_settings
from .commerce_models import AppMedia, AppOrder, AppOrderEvent, AppProduct
from .models import Customer
from .odoo_client import OdooClient, RESOURCES
from .odoo_models import OdooBinding, OdooCursor, OdooInbox, OdooOutbox


class Change(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str = Field(min_length=1, max_length=160)
    resource: str = Field(min_length=1, max_length=40)
    record_id: str = Field(min_length=1, max_length=160)
    version: int = Field(gt=0)
    deleted: bool = False
    payload: dict


class ProductPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=240)
    sku: str = Field(default="", max_length=160)
    parent_id: str | None = Field(default=None, max_length=160)
    type: str = Field(pattern="^(simple|variable|variation)$")
    price_minor: int = Field(ge=1, le=1000000000)
    currency: str = Field(pattern="^KES$")
    enabled: bool
    description: str = Field(default="", max_length=50000)
    categories: list[dict] = Field(default_factory=list, max_length=100)
    attributes: list[dict] = Field(default_factory=list, max_length=30)
    variation_attributes: list[dict] = Field(default_factory=list, max_length=30)
    variations: list[dict] = Field(default_factory=list, max_length=1000)
    image_base64: str | None = Field(default=None, max_length=2800000)
    image_mime: str = Field(default="image/png", pattern="^image/(png|jpeg|webp)$")


class DeliveryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference: str = Field(pattern=r"^APP-[A-Za-z0-9-]+$", max_length=50)
    status: str = Field(pattern="^(paid|preparing|ready|out_for_delivery|completed)$")
    rider_id: str | None = Field(default=None, max_length=160)
    rider_name: str = Field(default="", max_length=120)
    rider_phone: str = Field(default="", max_length=40)


def binding(db, resource, external_id):
    return db.scalar(select(OdooBinding).where(OdooBinding.source == get_settings().odoo_source_id,
        OdooBinding.resource == resource, OdooBinding.external_id == external_id).with_for_update())


def project_product(db, data, link):
    try:
        product = ProductPayload.model_validate(data)
    except ValueError:
        raise HTTPException(422, "Invalid Odoo product mapping; KES prices and explicit availability are required.") from None
    parent = binding(db, "products", product.parent_id) if product.parent_id else None
    if product.type == "variation" and (not parent or not product.parent_id):
        raise HTTPException(409, "Import the Odoo parent product before its variations.")
    identity = int(link.local_id)
    row = db.get(AppProduct, identity)
    if row and row.payload.get("odoo_source") != link.source:
        raise HTTPException(409, "Odoo product identity conflicts with an existing app product.")
    previous = row.payload if row else {}
    images = previous.get("images", [])
    if product.image_base64 is not None:
        try:
            image = base64.b64decode(product.image_base64, validate=True)
        except ValueError:
            raise HTTPException(422, "Invalid Odoo product image.") from None
        if not image or len(image) > 2_000_000:
            raise HTTPException(422, "Odoo product images must be nonempty and at most 2 MB.")
        key = hashlib.sha256(image).hexdigest()
        if not db.get(AppMedia, key):
            db.add(AppMedia(id=key, source_url=f"odoo:{link.source}:{key}", mime=product.image_mime, data=image))
        images = [{"id": identity, "src": "/v1/app-media/" + key, "thumbnail": "/v1/app-media/" + key,
                   "name": product.name, "alt": product.name}]
    variations = []
    for item in product.variations:
        child = binding(db, "products", str(item.get("id", "")))
        if child:
            variations.append({**item, "id": int(child.local_id)})
    payload = {"id": identity, "name": product.name, "slug": "odoo-" + str(identity),
        "type": product.type, "sku": product.sku, "description": product.description,
        "short_description": product.description, "images": images, "categories": product.categories,
        "attributes": product.attributes, "variation_attributes": product.variation_attributes,
        "variations": variations, "order_mode": "made_to_order", "is_purchasable": product.enabled,
        "odoo_source": link.source, "odoo_id": link.external_id,
        "prices": {"price": str(product.price_minor), "regular_price": str(product.price_minor),
                   "sale_price": "", "currency_code": "KES", "currency_minor_unit": 2,
                   "currency_symbol": "KSh", "currency_prefix": "KSh ", "currency_suffix": "",
                   "currency_decimal_separator": ".", "currency_thousand_separator": ","}}
    if row:
        row.payload, row.price_minor, row.enabled = payload, product.price_minor, product.enabled
        row.parent_id = int(parent.local_id) if parent else None
        row.revision += 1
    else:
        row = AppProduct(id=identity, slug=payload["slug"], parent_id=int(parent.local_id) if parent else None,
            payload=payload, price_minor=product.price_minor, enabled=product.enabled, allocation=0)
        db.add(row)
    # A variation update also invalidates the parent's selector and old quotes.
    if parent:
        parent_row = db.get(AppProduct, int(parent.local_id))
        items = list(parent_row.payload.get("variations", []))
        items = [item for item in items if item["id"] != identity]
        if product.enabled:
            items.append({"id": identity, "attributes": product.variation_attributes})
        parent_row.payload = {**parent_row.payload, "variations": items}
        parent_row.revision += 1


def project_delivery(db, data):
    try:
        value = DeliveryPayload.model_validate(data)
    except ValueError:
        raise HTTPException(422, "Invalid Odoo delivery mapping.") from None
    row = db.scalar(select(AppOrder).where(AppOrder.reference == value.reference).with_for_update())
    if not row or row.channel != "app" or row.environment != "live" or row.payment_state != "completed":
        raise HTTPException(409, "Odoo fulfilment requires an existing verified paid app order.")
    from .logistics_models import LogisticsTask
    if db.scalar(select(LogisticsTask.id).where(LogisticsTask.order_id == row.id).limit(1)):
        raise HTTPException(409, "Update this order through the Odoo logistics_tasks feed so trip readiness and proof checks are preserved.")
    delivery = row.snapshot.get("checkout", {}).get("fulfilment") == "delivery"
    if value.status == "out_for_delivery" and not delivery:
        raise HTTPException(409, "A pickup order cannot be dispatched.")
    stages = ["paid", "preparing", "ready", "out_for_delivery", "completed"]
    if row.state not in stages or stages.index(value.status) < stages.index(row.state):
        raise HTTPException(409, "Odoo cannot regress or override an order requiring review.")
    if value.rider_id:
        rider = binding(db, "riders", value.rider_id)
        if not rider or not rider.payload.get("active"):
            raise HTTPException(409, "Import the active Odoo rider before assigning delivery.")
        value.rider_name = rider.payload["name"]
        value.rider_phone = rider.payload["phone"]
    if value.rider_name or value.rider_phone:
        if not delivery or not value.rider_name or not value.rider_phone:
            raise HTTPException(422, "Rider assignments require a name, phone and delivery order.")
        db.add(AppOrderEvent(id=str(uuid4()), order_id=row.id, event_key=f"odoo-dispatch:{uuid4().hex}",
            kind="dispatch_assigned", details={"rider_name": value.rider_name, "rider_phone": value.rider_phone,
                                               "source": "odoo"}))
    if value.status == "out_for_delivery" and not value.rider_name:
        raise HTTPException(409, "An Odoo dispatch must include an assigned rider.")
    if row.state != value.status:
        row.state = value.status
        db.add(AppOrderEvent(id=str(uuid4()), order_id=row.id,
            event_key=f"odoo:{value.reference}:{value.status}:{uuid4().hex}",
            kind="fulfilment_" + value.status, details={"source": "odoo"}))


def apply_change(db, change):
    s = get_settings()
    if change.resource not in RESOURCES:
        raise HTTPException(422, "Unsupported Odoo resource; register its adapter before importing it.")
    identity = digest([s.odoo_source_id, change.event_id])
    fingerprint = digest(change.model_dump())
    previous = db.get(OdooInbox, identity)
    if previous:
        if previous.digest != fingerprint:
            raise HTTPException(409, "Odoo event ID was reused with different data.")
        return "duplicate"
    link = binding(db, change.resource, change.record_id)
    if link and change.version < link.version:
        raise HTTPException(409, "Stale Odoo record version.")
    if link and change.version == link.version:
        if link.payload != {**change.payload, "_deleted": change.deleted}:
            raise HTTPException(409, "Conflicting Odoo record version.")
        db.add(OdooInbox(id=identity, digest=fingerprint))
        return "duplicate"
    if not link:
        link = OdooBinding(source=s.odoo_source_id, resource=change.resource, external_id=change.record_id,
                           local_id="new:" + uuid4().hex, version=0)
        db.add(link)
        db.flush()
        link.local_id = str(1_000_000_000 + link.id) if change.resource == "products" else change.record_id
    if change.resource == "products":
        if change.deleted:
            row = db.get(AppProduct, int(link.local_id))
            if row:
                row.enabled = False
                row.revision += 1
        else:
            project_product(db, change.payload, link)
    elif change.resource == "deliveries" and not change.deleted:
        project_delivery(db, change.payload)
    elif change.resource == "logistics_tasks" and not change.deleted:
        from .logistics import import_trip
        try:
            import_trip(db, change.payload, link)
        except ValueError:
            raise HTTPException(422, "Invalid Odoo logistics task mapping.") from None
    elif change.resource == "kitchen_tasks" and not change.deleted:
        from .logistics import import_kitchen
        try:
            import_kitchen(db, change.payload)
        except ValueError:
            raise HTTPException(422, "Invalid Odoo kitchen assignment mapping.") from None
    elif change.resource == "riders" and not change.deleted:
        if (not isinstance(change.payload.get("name"), str) or not change.payload["name"]
                or not isinstance(change.payload.get("phone"), str) or not change.payload["phone"]):
            raise HTTPException(422, "An Odoo rider requires a name and phone.")
    link.version, link.payload = change.version, {**change.payload, "_deleted": change.deleted}
    db.add(OdooInbox(id=identity, digest=fingerprint))
    db.flush()
    return "accepted"


async def pull(db, limit=100):
    s = get_settings()
    cursor = db.get(OdooCursor, s.odoo_source_id)
    if not cursor:
        cursor = OdooCursor(source=s.odoo_source_id, cursor=0)
        db.add(cursor)
        db.commit()
    original = cursor.cursor
    result = await OdooClient().bridge("changes", after=original, limit=limit)
    try:
        changes = [Change.model_validate(item) for item in result["data"]]
        next_cursor = result["next_cursor"]
        if (type(next_cursor) is not int or next_cursor < original or len(changes) > limit
                or (changes and next_cursor <= original)):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(502, "Odoo returned an invalid change-feed page.") from None
    # Serialize feed application; a concurrent worker must refetch its page.
    claimed = db.execute(update(OdooCursor).where(OdooCursor.source == s.odoo_source_id,
        OdooCursor.cursor == original).values(cursor=next_cursor, last_success=datetime.now(UTC)))
    if claimed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Another Odoo sync advanced the cursor. Retry.")
    statuses = [apply_change(db, item) for item in changes]
    db.commit()
    from .catalogue import catalogue
    catalogue.cache.clear()
    return {"processed": len(changes), "accepted": statuses.count("accepted"), "cursor": next_cursor,
            "has_more": result.get("has_more", False)}


def enqueue(db, kind, aggregate, payload, key=None):
    s = get_settings()
    if not s.odoo_enabled or db.info.get("odoo_import"):
        return
    identity = digest([s.odoo_source_id, key or uuid4().hex])
    if any(isinstance(item, OdooOutbox) and item.id == identity for item in db.new) or db.get(OdooOutbox, identity):
        return
    now = datetime.now(UTC)
    db.add(OdooOutbox(id=identity, source=s.odoo_source_id, kind=kind, aggregate=aggregate,
        payload={"event_id": identity, "kind": kind, "aggregate": aggregate,
                 "occurred_at": now.isoformat(), "data": payload}, available_at=now, created_at=now))


def capture_order(db, order, kind, details=None):
    if not get_settings().odoo_enabled or order.channel != "app" or order.environment != "live":
        return
    customer = db.get(Customer, order.customer_id)
    lines = []
    for line in order.snapshot.get("lines", []):
        link = db.scalar(select(OdooBinding).where(OdooBinding.source == get_settings().odoo_source_id,
            OdooBinding.resource == "products", OdooBinding.local_id == str(line["sku_id"])))
        lines.append({**line, "odoo_id": link.external_id if link else None})
    enqueue(db, "order." + kind, order.reference, {
        "reference": order.reference, "customer_id": order.customer_id, "environment": order.environment,
        "channel": order.channel, "state": order.state, "payment_state": order.payment_state,
        "total_minor": order.total_minor, "subtotal_minor": order.subtotal_minor,
        "discount_minor": order.discount_minor, "delivery_minor": order.delivery_minor, "currency": "KES",
        "tracking_id": order.tracking_id, "paid_at": utc(order.paid_at).isoformat() if order.paid_at else None,
        "customer": {"id": customer.id, "name": f"{customer.first_name} {customer.last_name}",
                     "email": customer.email, "phone": customer.phone},
        "checkout": order.snapshot.get("checkout", {}), "lines": lines, "event_details": details or {},
    }, key=f"{order.reference}:{kind}")


@event.listens_for(Session, "before_flush")
def capture_account_changes(db, flush_context, instances):
    if not get_settings().odoo_enabled or db.info.get("odoo_import"):
        return
    fields = {
        "Customer": ("first_name", "last_name", "email", "phone"),
        "Address": ("customer_id", "label", "recipient_name", "phone", "line1", "line2", "area", "city", "delivery_notes", "is_default"),
        "Enquiry": ("customer_id", "kind", "subject", "details", "status", "staff_response", "quote_minor"),
        "Celebration": ("customer_id", "name", "occasion", "month", "day", "notes"),
    }
    for item in list(db.new) + list(db.dirty) + list(db.deleted):
        names = fields.get(type(item).__name__)
        if not names or (item in db.dirty and not db.is_modified(item, include_collections=False)):
            continue
        payload = {name: getattr(item, name) for name in names}
        payload.update(id=item.id, deleted=item in db.deleted)
        enqueue(db, type(item).__name__.lower() + ".changed", str(item.id), payload)


async def drain(db, limit=50):
    s = get_settings()
    now = datetime.now(UTC)
    ids = list(db.scalars(select(OdooOutbox.id).where(OdooOutbox.source == s.odoo_source_id,
        OdooOutbox.state != "delivered", OdooOutbox.available_at <= now)
        .order_by(OdooOutbox.created_at, OdooOutbox.id).limit(limit)))
    counts = {"delivered": 0, "retry": 0}
    for identity in ids:
        row = db.get(OdooOutbox, identity)
        older = db.scalar(select(OdooOutbox.id).where(OdooOutbox.source == row.source,
            OdooOutbox.aggregate == row.aggregate, OdooOutbox.state != "delivered",
            OdooOutbox.created_at < row.created_at).limit(1))
        if older:
            continue
        token = str(uuid4())
        claimed = db.execute(update(OdooOutbox).where(OdooOutbox.id == identity,
            OdooOutbox.state != "delivered", OdooOutbox.available_at <= now)
            .values(state="processing", lease_token=token, available_at=now+timedelta(minutes=2),
                    attempts=OdooOutbox.attempts+1).execution_options(synchronize_session=False))
        db.commit()
        if claimed.rowcount != 1:
            continue
        db.refresh(row)
        try:
            result = await OdooClient().bridge("apply_event", event=row.payload)
            if not isinstance(result, dict) or result.get("event_id") != identity or result.get("status") not in ("accepted", "duplicate"):
                raise HTTPException(502, "Odoo did not acknowledge the original event.")
            values = dict(state="delivered", lease_token=None, last_error="")
            counts["delivered"] += 1
        except HTTPException as error:
            values = dict(state="retry", lease_token=None, last_error=str(error.detail),
                available_at=datetime.now(UTC)+timedelta(seconds=min(3600, 2**min(row.attempts, 10))))
            counts["retry"] += 1
        db.execute(update(OdooOutbox).where(OdooOutbox.id == identity, OdooOutbox.lease_token == token).values(**values))
        db.commit()
    return counts
