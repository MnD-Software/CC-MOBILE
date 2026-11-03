"""App-only operations and optional website reporting ingestion; no website RPC calls."""
import hashlib
import hmac
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session

from . import app_commerce as commerce
from .commerce_models import AppDeliveryZone, AppOrder, AppOrderEvent, AppPage, AppPolicy, AppProduct, CommerceIssue, SalesRecord
from .config import get_settings
from .db import get_db
from .models import Customer
from .permissions import audit
from .routes_club import member

router = APIRouter(tags=["app-commerce-operations"])


def operator(customer: Customer = Depends(member)):
    if customer.role not in ("admin", "staff", "ecommerce_manager"):
        raise HTTPException(403, "App commerce operator access required.")
    return customer


def reporting(customer: Customer = Depends(member)):
    if customer.role not in ("admin", "staff", "ecommerce_manager", "executive", "finance", "analyst"):
        raise HTTPException(403, "Channel reporting access required.")
    return customer


class StockInput(BaseModel):
    revision: int = Field(ge=1)
    allocation: int = Field(ge=0, le=1000000)
    price_minor: int = Field(ge=1, le=1000000000)
    enabled: bool


@router.get("/v1/admin/app-products")
def products(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    return [{"id": r.id, "name": r.payload.get("name", r.slug), "parent_id": r.parent_id, "price_minor": r.price_minor,
             "allocation": r.allocation, "reserved": r.reserved, "sold": r.sold, "enabled": r.enabled, "revision": r.revision,
             "order_mode": r.payload.get("order_mode", "stocked")}
            for r in db.scalars(select(AppProduct).order_by(AppProduct.id).limit(5000))]


@router.put("/v1/admin/app-products/{identity}")
def product(identity: int, data: StockInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    result = db.execute(update(AppProduct).where(AppProduct.id == identity, AppProduct.revision == data.revision,
        AppProduct.reserved+AppProduct.sold <= data.allocation).values(price_minor=data.price_minor, allocation=data.allocation,
        enabled=data.enabled, revision=AppProduct.revision+1))
    if result.rowcount != 1:
        raise HTTPException(409, "Product changed or allocation would erase reserved/sold stock.")
    audit(db, actor.id, "app_product_configured", str(identity), allocation=data.allocation, price_minor=data.price_minor)
    db.commit()
    from .catalogue import catalogue
    catalogue.cache.clear()
    return {"status": "saved"}


class PolicyInput(BaseModel):
    enabled: bool
    pricing_confirmed: bool
    pickup_enabled: bool
    prices_include_tax: bool
    tax_bps: int = Field(ge=0, le=10000)
    pickup_instructions: str = Field(min_length=1, max_length=1000)


@router.get("/v1/admin/app-policy")
def read_policy(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(AppPolicy, "checkout")
    return row.payload if row else None


@router.put("/v1/admin/app-policy")
def policy(data: PolicyInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(AppPolicy, "checkout")
    if not row:
        row = AppPolicy(id="checkout", payload={})
        db.add(row)
    row.payload = data.model_dump()
    audit(db, actor.id, "app_checkout_policy", "checkout", enabled=data.enabled)
    db.commit()
    return {"status": "saved"}


class ZoneInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    fee_minor: int = Field(ge=0, le=10000000)
    enabled: bool = True


@router.put("/v1/admin/app-delivery-zones/{identity}")
def zone(identity: str, data: ZoneInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(AppDeliveryZone, identity)
    if not row:
        row = AppDeliveryZone(id=identity, revision=0)
        db.add(row)
    row.name, row.fee_minor, row.enabled = data.name, data.fee_minor, data.enabled
    row.revision += 1
    audit(db, actor.id, "app_delivery_zone", identity)
    db.commit()
    return {"status": "saved"}


class PageInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    body: str = Field(min_length=1, max_length=150000)
    published: bool = True


@router.put("/v1/admin/app-pages/{slug}")
def page(slug: str, data: PageInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(AppPage, slug)
    if not row:
        row = AppPage(slug=slug)
        db.add(row)
    row.title, row.body, row.published = data.title, data.body, data.published
    row.revision = hashlib.sha256(data.body.encode()).hexdigest()
    audit(db, actor.id, "app_page_published", slug)
    db.commit()
    return {"status": "saved", "revision": row.revision}


@router.get("/v1/admin/app-orders")
def orders(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    return [commerce.order_view(r) for r in db.scalars(select(AppOrder).order_by(AppOrder.id.desc()).limit(200))]


class FulfilmentInput(BaseModel):
    status: str = Field(pattern="^(preparing|ready|out_for_delivery|completed)$")


@router.patch("/v1/admin/app-orders/{reference}")
def fulfil(reference: str, data: FulfilmentInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.scalar(select(AppOrder).where(AppOrder.reference == reference).with_for_update())
    transitions = {"paid": {"preparing"}, "preparing": {"ready"}, "ready": {"out_for_delivery", "completed"}, "out_for_delivery": {"completed"}}
    if not row or row.payment_state != "completed" or data.status not in transitions.get(row.state, set()):
        raise HTTPException(409, "This fulfilment transition is not available.")
    row.state = data.status
    commerce.record_event(db, row, "fulfilment_" + data.status, actor_id=actor.id)
    audit(db, actor.id, "app_order_fulfilment", reference, status=data.status)
    db.commit()
    return commerce.order_view(row)


@router.get("/v1/admin/channel-sales")
def sales(environment: str = "live", _: Customer = Depends(reporting), db: Session = Depends(get_db)):
    if environment not in ("live", "sandbox"):
        raise HTTPException(422, "Invalid environment")
    rows = db.execute(select(SalesRecord.channel, func.count(), func.sum(SalesRecord.paid_minor), func.sum(SalesRecord.reversed_minor))
                      .where(SalesRecord.environment == environment).group_by(SalesRecord.channel)).all()
    return {"currency": "KES", "environment": environment,
            "channels": [{"channel": r[0], "orders": r[1], "gross_minor": r[2], "reversed_minor": r[3], "net_minor": r[2]-r[3]} for r in rows],
            "website_reporting": "No website totals are assumed. Only explicitly ingested website sales are included."}


@router.get("/v1/admin/commerce-issues")
def issues(_: Customer = Depends(reporting), db: Session = Depends(get_db)):
    return [{"id": r.id, "channel": r.channel, "reference": r.reference, "kind": r.kind, "status": r.status}
            for r in db.scalars(select(CommerceIssue).order_by(CommerceIssue.created_at.desc()).limit(300))]


class IssueUpdate(BaseModel):
    status: str = Field(pattern="^(open|resolved)$")


@router.patch("/v1/admin/commerce-issues/{identity}")
def issue_status(identity: str, data: IssueUpdate, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(CommerceIssue, identity)
    if not row:
        raise HTTPException(404, "Issue not found")
    row.status = data.status
    audit(db, actor.id, "commerce_issue_status", identity, channel=row.channel, status=data.status)
    db.commit()
    return {"status": row.status, "channel": row.channel}


class WebsiteSale(BaseModel):
    reference: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
    environment: str = Field(pattern="^(live|sandbox)$")
    paid_minor: int = Field(ge=0, le=2000000000)
    reversed_minor: int = Field(default=0, ge=0, le=2000000000)
    version: int = Field(ge=1)
    occurred_at: datetime


@router.post("/v1/integrations/website-sales")
async def website_sale(request: Request, x_sales_signature: str = Header(default=""), db: Session = Depends(get_db)):
    secret = get_settings().sales_ingest_secret
    if len(secret) < 32:
        raise HTTPException(503, "Website sales reporting ingestion is not configured.")
    raw = await request.body()
    if len(raw) > 10000:
        raise HTTPException(413, "Sales event too large")
    if not hmac.compare_digest(hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(), x_sales_signature):
        raise HTTPException(401, "Invalid sales signature")
    try:
        data = WebsiteSale.model_validate_json(raw)
    except ValueError:
        raise HTTPException(422, "Invalid website sales event") from None
    if data.reference.startswith("APP-") or data.reversed_minor > data.paid_minor or not data.occurred_at.tzinfo:
        raise HTTPException(422, "Invalid sales totals or timestamp")
    row = db.scalar(select(SalesRecord).where(SalesRecord.channel == "website", SalesRecord.reference == data.reference,
                                            SalesRecord.environment == data.environment).with_for_update())
    if row:
        if data.version < row.version or (data.version == row.version and (data.paid_minor, data.reversed_minor) != (row.paid_minor, row.reversed_minor)):
            raise HTTPException(409, "Conflicting or stale website sales event")
        row.paid_minor, row.reversed_minor, row.version = data.paid_minor, data.reversed_minor, data.version
    else:
        db.add(SalesRecord(id=str(uuid4()), channel="website", reference=data.reference, environment=data.environment,
            paid_minor=data.paid_minor, reversed_minor=data.reversed_minor, version=data.version, occurred_at=data.occurred_at))
    db.commit()
    return {"status": "accepted", "channel": "website"}
