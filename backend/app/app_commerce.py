"""App checkout, stock reservations and sales ledger. All customer operations are local."""
import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .commerce_models import AppCoupon, AppDeliveryZone, AppOrder, AppOrderEvent, AppPolicy, AppProduct, AppQuote, CommerceIssue, SalesRecord


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: int = Field(gt=0)
    variation_id: int | None = Field(default=None, gt=0)
    quantity: int = Field(ge=1, le=20)
    size: str = Field(default="1kg", max_length=30)
    message: str = Field(default="", max_length=32)
    add_ons: list[str] = Field(default_factory=list, max_length=10)
    variation_attributes: list[dict[str, str]] = Field(default_factory=list, max_length=8)


class Billing(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: str = Field(pattern=r"^(?:\+?254|0)[17][0-9]{8}$")
    address: str = Field(default="", max_length=240)
    area: str = Field(default="", max_length=160)
    city: str = Field(default="", max_length=120)
    postcode: str = Field(default="", max_length=16)


class CheckoutData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[Selection] = Field(min_length=1, max_length=30)
    fulfilment: str = Field(pattern="^(pickup|delivery)$")
    delivery_zone_id: str | None = Field(default=None, max_length=80)
    delivery_quote_id: str | None = Field(default=None, max_length=36)
    coupon_code: str | None = Field(default=None, max_length=100)
    billing: Billing
    recipient_name: str = Field(default="", max_length=160)
    recipient_phone: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=1500)


class PlaceOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quote_id: str = Field(min_length=36, max_length=36)


def calculate(db, customer_id, data):
    from .payment_test import PRODUCT_ID, require_tester
    from .models import Customer
    payment_test = any(item.product_id == PRODUCT_ID or item.variation_id == PRODUCT_ID for item in data.items)
    if payment_test:
        require_tester(db.get(Customer, customer_id))
        if (len(data.items) != 1 or data.items[0].product_id != PRODUCT_ID
                or data.items[0].variation_id or data.items[0].quantity != 1
                or data.items[0].add_ons or data.coupon_code):
            raise HTTPException(422, "A KES 1 payment test must contain only one test product, without other goods or coupons.")
    policy = db.get(AppPolicy, "checkout")
    if not payment_test and (not policy or not policy.payload.get("enabled") or not policy.payload.get("pricing_confirmed")):
        raise HTTPException(503, "App ordering is awaiting Cake City's pricing and fulfilment setup. Your bag has been kept.")
    policy = policy.payload if policy else {}
    from . import app_delivery
    delivery_config = app_delivery.policy(db)
    if not payment_test and data.fulfilment == "pickup" and not policy.get("pickup_enabled"):
        raise HTTPException(409, "Pickup is not currently enabled in the app.")
    if not payment_test and data.fulfilment == "delivery" and (not data.billing.address or (not delivery_config.enabled and (not data.billing.area or not data.billing.city))):
        raise HTTPException(422, "Complete your delivery address.")
    lines, quantities = [], {}
    for item in data.items:
        parent = db.get(AppProduct, item.product_id)
        product = db.get(AppProduct, item.variation_id or item.product_id)
        if not parent or not parent.enabled or not product or not product.enabled or product.price_minor is None:
            raise HTTPException(409, "One of these products is not available for app orders.")
        from .config import get_settings
        settings = get_settings()
        if (settings.odoo_enabled and settings.odoo_require_mapped_products and not payment_test
                and not product.payload.get("odoo_source")):
            raise HTTPException(409, "This cake must be mapped to Odoo before orders can be accepted.")
        if payment_test and (not product.payload.get("payment_test") or product.price_minor != 100):
            raise HTTPException(409, "The test product must remain priced at exactly KES 1.")
        if product.payload.get("odoo_source"):
            from .config import get_settings
            from .odoo_models import OdooCursor
            settings = get_settings()
            cursor = db.get(OdooCursor, settings.odoo_source_id)
            if (not settings.odoo_enabled or product.payload["odoo_source"] != settings.odoo_source_id
                    or not cursor or not cursor.last_success
                    or datetime.now(UTC)-utc(cursor.last_success) > timedelta(seconds=settings.odoo_catalogue_max_age_seconds)):
                raise HTTPException(503, "Odoo catalogue synchronization is overdue. Refresh before paying; your bag is kept.")
        if (item.variation_id and product.parent_id != parent.id) or (not item.variation_id and parent.payload.get("type") == "variable"):
            raise HTTPException(422, "Choose a valid product variation.")
        if item.add_ons:
            raise HTTPException(409, "Add each extra to your bag as its own product before checkout.")
        # Variation price/identity is resolved entirely from the app database.
        # Reject unknown attribute claims rather than ignoring a changed cake configuration.
        aliases = {}
        for group in parent.payload.get("attributes", []):
            name = str(group.get("name", "")).casefold()
            aliases[name] = name
            if group.get("taxonomy"):
                aliases[str(group["taxonomy"]).casefold()] = name
        canonical = lambda value: aliases.get(str(value).casefold(), str(value).casefold())
        known = {(canonical(a.get("name", a.get("attribute", ""))), str(a.get("value", "")).casefold())
                 for a in product.payload.get("variation_attributes", [])}
        if item.variation_attributes and known and any(
                (canonical(a.get("attribute", "")), a.get("value", "").casefold()) not in known for a in item.variation_attributes):
            raise HTTPException(409, "Your variation details changed. Reopen this product before paying.")
        quantities[product.id] = quantities.get(product.id, 0) + item.quantity
        made_to_order = product.payload.get("order_mode") == "made_to_order"
        if not made_to_order and quantities[product.id] > product.allocation - product.reserved - product.sold:
            raise HTTPException(409, "The app's available stock or production capacity has changed. Review your bag.")
        lines.append({"product_id": parent.id, "sku_id": product.id, "name": parent.payload.get("name", parent.slug),
                      "slug": parent.slug, "quantity": item.quantity, "unit_minor": product.price_minor,
                      "line_minor": product.price_minor*item.quantity, "revision": product.revision,
                      "order_mode": "made_to_order" if made_to_order else "stocked",
                      "selection": item.model_dump(exclude={"product_id", "quantity"})})
    subtotal = sum(line["line_minor"] for line in lines)
    fee, zone_revision, zone_name = 0, None, None
    route_snapshot = None
    if delivery_config.enabled and not payment_test:
        route_snapshot = app_delivery.checked_quote(db, customer_id, data.delivery_quote_id, data.fulfilment)
        fee = route_snapshot["fee_minor"]
        zone_name = route_snapshot["destination_name"]
    elif data.fulfilment == "delivery" and not payment_test:
        zone = db.get(AppDeliveryZone, data.delivery_zone_id)
        if not zone or not zone.enabled:
            raise HTTPException(409, "Select a delivery area configured in the app.")
        fee, zone_revision, zone_name = zone.fee_minor, zone.revision, zone.name
    discount, coupon_code = 0, None
    if data.coupon_code:
        coupon_code = data.coupon_code.strip().casefold()
        coupon = db.get(AppCoupon, coupon_code)
        if (not coupon or not coupon.enabled or coupon.customer_id not in (None, customer_id)
                or coupon.uses + coupon.reserved >= coupon.usage_limit or subtotal < coupon.minimum_minor
                or (coupon.expires_at and utc(coupon.expires_at) <= datetime.now(UTC))):
            raise HTTPException(409, "This app coupon is not eligible for this order.")
        discount = min(coupon.amount_minor, subtotal)
    base = subtotal + fee - discount
    rate = 0 if payment_test else int(policy.get("tax_bps", 0))
    included = True if payment_test else bool(policy.get("prices_include_tax", True))
    tax = (base*rate + (10000+rate)//2)//(10000+rate) if included else (base*rate + 5000)//10000
    total = base if included else base + tax
    if not 0 < total <= 1_000_000_000:
        raise HTTPException(409, "This order total needs staff assistance.")
    pickup_instructions = "Simulated order. No money charged or physical fulfilment required." if payment_test else (policy.get("pickup_instructions", "") if data.fulfilment == "pickup" else "")
    if route_snapshot and data.fulfilment == "pickup" and route_snapshot.get("pickup_location_id") != "hq":
        pickup_instructions = f"Collect from {route_snapshot['destination_name']}, {route_snapshot['destination_address']}, after your order is marked ready. Present your APP order reference."
    return {**({"payment_test": True} if payment_test else {}), "lines": lines, "quantities": {str(k): v for k, v in quantities.items()}, "subtotal_minor": subtotal,
            "delivery_minor": fee, "discount_minor": discount, "tax_minor": tax, "prices_include_tax": included,
            "total_minor": total, "currency": "KES", "coupon_code": coupon_code, "zone_revision": zone_revision,
            "zone_name": zone_name, "route": route_snapshot, "policy_digest": digest(policy), "checkout": data.model_dump(mode="json"), "pickup_instructions": pickup_instructions}


def quote(db, customer_id, data):
    snapshot = calculate(db, customer_id, data)
    row = AppQuote(id=str(uuid4()), customer_id=customer_id, request_digest=digest(snapshot), snapshot=snapshot,
                   expires_at=datetime.now(UTC)+timedelta(minutes=10))
    db.add(row)
    db.commit()
    return {"id": row.id, "expires_at": utc(row.expires_at).isoformat(), **snapshot}


def record_event(db, order, kind, **details):
    key = f"{order.reference}:{kind}"
    if not db.scalar(select(AppOrderEvent.id).where(AppOrderEvent.event_key == key)):
        db.add(AppOrderEvent(id=str(uuid4()), order_id=order.id, event_key=key, kind=kind, details=details))
        from .odoo_sync import capture_order
        capture_order(db, order, kind, details)
        from .notifications import order_event
        order_event(db, order, kind)


def issue(db, reference, kind, channel="app"):
    if not db.scalar(select(CommerceIssue.id).where(CommerceIssue.reference == reference, CommerceIssue.kind == kind, CommerceIssue.channel == channel)):
        db.add(CommerceIssue(id=str(uuid4()), reference=reference, kind=kind, channel=channel))


def place(db, customer_id, quote_id, request_key, account_id, environment, *, review=False):
    if review:
        from .review_checkout import require_local_review
        require_local_review()
    from .models import Customer
    from .customer_lifecycle import ClosedAccount
    db.scalar(select(Customer).where(Customer.id == customer_id).with_for_update())
    if db.get(ClosedAccount, customer_id):
        raise HTTPException(401, "This account is closed.")
    from .pesapal import account as payment_account
    old = db.scalar(select(AppOrder).where(AppOrder.customer_id == customer_id, AppOrder.request_key == request_key))
    if old:
        if old.request_digest != digest({"quote_id": quote_id}):
            raise HTTPException(409, "This payment request belongs to another checkout. Check your existing order.")
        return old
    saved = db.get(AppQuote, quote_id)
    if not saved or saved.customer_id != customer_id or utc(saved.expires_at) < datetime.now(UTC):
        raise HTTPException(409, "Your quote has expired. Review the current total before payment.")
    current = calculate(db, customer_id, CheckoutData.model_validate(saved.snapshot["checkout"]))
    if digest(current) != saved.request_digest:
        raise HTTPException(409, "Prices, stock or delivery rules changed. Review a new quote before paying.")
    if review:
        current = {**current, "review_checkout": True, "payment_test": True}
    # Conditional atomic updates work on PostgreSQL and SQLite and prevent overselling.
    try:
        for identity, quantity in sorted(current["quantities"].items(), key=lambda item: int(item[0])):
            expected = next(line for line in current["lines"] if line["sku_id"] == int(identity))
            condition = update(AppProduct).where(AppProduct.id == int(identity), AppProduct.enabled.is_(True),
                AppProduct.revision == expected["revision"], AppProduct.price_minor == expected["unit_minor"])
            if expected["order_mode"] == "made_to_order":
                # Claim the unchanged catalogue revision without reserving physical stock.
                result = db.execute(condition.where(AppProduct.payload["order_mode"].as_string() == "made_to_order")
                    .values(revision=AppProduct.revision))
            else:
                result = db.execute(condition.where(AppProduct.allocation-AppProduct.reserved-AppProduct.sold >= quantity)
                    .values(reserved=AppProduct.reserved+quantity))
            if result.rowcount != 1:
                raise HTTPException(409, "Available app stock changed. Please review your bag.")
        if current["coupon_code"]:
            result = db.execute(update(AppCoupon).where(AppCoupon.code == current["coupon_code"],
                AppCoupon.uses+AppCoupon.reserved < AppCoupon.usage_limit).values(reserved=AppCoupon.reserved+1))
            if result.rowcount != 1:
                raise HTTPException(409, "This coupon has just been used.")
        reference = ("APP-TEST-" if current.get("payment_test") and not review else "APP-") + datetime.now(UTC).strftime("%Y%m%d") + "-" + uuid4().hex[:16].upper()
        order = AppOrder(reference=reference, customer_id=customer_id, request_key=request_key,
                         request_digest=digest({"quote_id": quote_id}), account_id=account_id, environment=environment,
                         account_fingerprint=digest("simulation" if current.get("payment_test") else payment_account(account_id)["consumer_key"]),
                         snapshot=current, total_minor=current["total_minor"], subtotal_minor=current["subtotal_minor"],
                         discount_minor=current["discount_minor"], delivery_minor=current["delivery_minor"],
                         coupon_code=current["coupon_code"], channel="app_test" if current.get("payment_test") else "app")
        db.add(order)
        db.flush()
        record_event(db, order, "order_created", channel=order.channel, account_id=account_id)
        db.commit()
        return order
    except IntegrityError:
        db.rollback()
        old = db.scalar(select(AppOrder).where(AppOrder.customer_id == customer_id, AppOrder.request_key == request_key))
        if old and old.request_digest == digest({"quote_id": quote_id}):
            return old
        raise HTTPException(409, "This order request is already being processed. Check your orders.") from None
    except HTTPException:
        db.rollback()
        raise


def inventory_transition(db, order, paid=False):
    if order.inventory_state != "reserved":
        return
    for identity, quantity in sorted(order.snapshot["quantities"].items(), key=lambda item: int(item[0])):
        line = next(line for line in order.snapshot["lines"] if line["sku_id"] == int(identity))
        if line.get("order_mode") == "made_to_order":
            continue
        result = db.execute(update(AppProduct).where(AppProduct.id == int(identity), AppProduct.reserved >= quantity).values(
            reserved=AppProduct.reserved-quantity, sold=AppProduct.sold+(quantity if paid else 0)))
        if result.rowcount != 1:
            raise HTTPException(409, "Stock reservations require staff reconciliation.")
    if order.coupon_code:
        result = db.execute(update(AppCoupon).where(AppCoupon.code == order.coupon_code, AppCoupon.reserved > 0).values(
            reserved=AppCoupon.reserved-1, uses=AppCoupon.uses+(1 if paid else 0)))
        if result.rowcount != 1:
            raise HTTPException(409, "Coupon reservation requires staff reconciliation.")
    order.inventory_state = "sold" if paid else "released"


def sale(db, order, reversed=False):
    if order.channel == "app_test":
        return
    record = db.scalar(select(SalesRecord).where(SalesRecord.channel == order.channel, SalesRecord.reference == order.reference,
                                                SalesRecord.environment == order.environment))
    if not record:
        record = SalesRecord(id=str(uuid4()), channel=order.channel, reference=order.reference, environment=order.environment,
                             account_id=order.account_id, paid_minor=order.total_minor, occurred_at=datetime.now(UTC))
        db.add(record)
    if reversed:
        record.reversed_minor = order.total_minor
        record.version += 1


def order_view(order, private=True):
    result = {"reference": order.reference, "channel": "app", "payment_test": order.channel == "app_test", "environment": order.environment,
              "payment_account": order.account_id, "status": order.state, "payment_state": order.payment_state,
              "total_minor": order.total_minor, "currency": "KES", "created_at": utc(order.created_at).isoformat(),
              "paid_at": utc(order.paid_at).isoformat() if order.paid_at else None}
    result["items"] = [{"product_id": line.get("product_id"), "slug": line.get("slug", ""),
                        "name": line.get("name", ""), "quantity": line.get("quantity", 1),
                        "size": str(line.get("selection", {}).get("size", ""))}
                       for line in order.snapshot.get("lines", [])]
    if order.snapshot.get("review_checkout"):
        result.update(review_checkout=True, due_now_minor=0)
    if private:
        result.update(snapshot=order.snapshot, payment_url=order.payment_url if order.payment_state == "pending" else None,
                      tracking_id=order.tracking_id, receipt_label="Payment receipt — not an eTIMS tax invoice")
    return result


def tracked_order_view(db, order):
    """Customer-safe progress history; never expose internal event details."""
    result = order_view(order)
    from .order_home import OrderAcknowledgement
    acknowledgement = db.get(OrderAcknowledgement, order.id)
    result["received_at"] = utc(acknowledgement.received_at).isoformat() if acknowledgement else None
    visible = ["payment_completed", "fulfilment_preparing", "fulfilment_ready",
               "fulfilment_out_for_delivery", "fulfilment_completed"]
    result["events"] = [{"kind": event.kind, "created_at": utc(event.created_at).isoformat()}
                        for event in db.scalars(select(AppOrderEvent).where(AppOrderEvent.order_id == order.id)
                                                .order_by(AppOrderEvent.created_at, AppOrderEvent.id))
                        if event.kind in visible]
    dispatch = db.scalar(select(AppOrderEvent).where(AppOrderEvent.order_id == order.id,
        AppOrderEvent.kind == "dispatch_assigned").order_by(AppOrderEvent.created_at.desc(), AppOrderEvent.id.desc()))
    if dispatch:
        result["dispatch"] = {k: dispatch.details[k] for k in ("rider_name", "rider_phone") if k in dispatch.details}
    result["events"].sort(key=lambda event: (event["created_at"], visible.index(event["kind"])))
    from .logistics_models import LogisticsTask, LogisticsEvent
    tasks = list(db.scalars(select(LogisticsTask).where(LogisticsTask.order_id == order.id)
        .order_by(LogisticsTask.created_at)))
    if tasks:
        from .live_tracking import customer_position
        from .ride_feedback import for_task
        result["deliveries"] = [{"id": task.id, "status": task.status, "service_type": task.service_type,
            "scheduled_at": utc(task.scheduled_at).isoformat() if task.scheduled_at else None,
              "slot": task.slot, "feedback": for_task(db, task), "destination_matches_checkout": bool(order.snapshot.get("route") and task.destination == order.snapshot["route"].get("destination_address")),
              "position": customer_position(db, task) if order.state not in {"completed", "cancelled", "review_required"} and order.payment_state == "completed" else None,
              "events": [{"status": event.status, "at": utc(event.created_at).isoformat()}
                         for event in db.scalars(select(LogisticsEvent)
                         .where(LogisticsEvent.task_id == task.id)
                         .order_by(LogisticsEvent.created_at))]}
              for task in tasks if task.status != "cancelled"]
        active = next((task for task in reversed(tasks) if task.rider_id and task.status not in ("cancelled", "delivered")), None)
        if active:
            from .models import Customer
            rider = db.get(Customer, active.rider_id)
            result["dispatch"] = {"rider_name": f"{rider.first_name} {rider.last_name}", "rider_phone": rider.phone or ""}
    return result
