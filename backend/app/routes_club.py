import base64
import re
import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ClubAccount, ClubEntry, ClubOrder, ClubRedemption, Customer
from .security import customer_from_access_token

router = APIRouter(tags=["club"])


def member(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return customer_from_access_token(db, authorization)


def account(db, customer_id):
    if not db.get(ClubAccount, customer_id):
        db.add(ClubAccount(customer_id=customer_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
    # A write locks the member row on PostgreSQL and SQLite. Every balance
    # mutation takes this lock before reading lots, orders or idempotency keys.
    db.execute(update(ClubAccount).where(ClubAccount.customer_id == customer_id).values(points=ClubAccount.points))
    result = db.get(ClubAccount, customer_id, populate_existing=True)
    now = datetime.now(UTC)
    lots = db.scalars(select(ClubEntry).where(
        ClubEntry.customer_id == customer_id, ClubEntry.remaining > 0,
        ClubEntry.expires_at <= now,
    )).all()
    for lot in lots:
        expired = lot.remaining
        lot.remaining = 0
        result.points -= expired
        db.add(ClubEntry(id=str(uuid4()), customer_id=customer_id,
            event_key=f"expiry:{lot.id}", points=-expired,
            description="Points expired after 12 months", remaining=0, order_id=lot.order_id))
    db.flush()
    return result


def consume(db, customer_id, points):
    lots = db.scalars(select(ClubEntry).where(
        ClubEntry.customer_id == customer_id, ClubEntry.remaining > 0,
    ).order_by(ClubEntry.expires_at, ClubEntry.created_at, ClubEntry.id)).all()
    for lot in lots:
        take = min(lot.remaining, points)
        lot.remaining -= take
        points -= take
        if not points:
            break
    if points:
        raise HTTPException(409, "Points ledger requires reconciliation")


@router.get("/v1/club")
def overview(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    value = account(db, customer.id)
    settings = get_settings()
    tiers = [(0, "Silver"), (2000000, "Gold"), (5000000, "Diamond"), (10000000, "Platinum")]
    tier = next(name for threshold, name in reversed(tiers) if value.spend_minor >= threshold)
    next_tier = next(({"name": name, "spend_required_kes": (threshold-value.spend_minor)/100}
        for threshold, name in tiers if threshold > value.spend_minor), None)
    entries = db.scalars(select(ClubEntry).where(ClubEntry.customer_id == customer.id)
        .order_by(ClubEntry.created_at.desc(), ClubEntry.id.desc()).limit(30)).all()
    coupons = db.scalars(select(ClubRedemption).where(ClubRedemption.customer_id == customer.id)
        .order_by(ClubRedemption.id).limit(100)).all()
    payload = {"member_id": customer.id, "points": value.points, "debt": value.debt,
        "tier": tier, "next_tier": next_tier,
        "rules": {"earn_spend_kes": settings.club_earn_minor/100,
            "point_value_kes": settings.club_point_value_minor/100,
            "expiry_days": settings.club_expiry_days, "minimum_redemption": 100,
            "minimum_order_multiple": 10},
        "redemption_available": bool(settings.woocommerce_consumer_key and settings.woocommerce_consumer_secret) and not value.review_required,
        "review_required": value.review_required,
        "activity": [{"id": e.id, "points": e.points, "description": e.description,
            "created_at": e.created_at.isoformat()} for e in entries],
        "coupons": [{"id": c.id, "points": c.points, "code": c.code if c.status == "issued" else None,
            "status": c.status, "request_key": c.request_key} for c in coupons]}
    db.commit()
    return payload


@router.get("/v1/club/transactions")
def transactions(before: str | None = Query(default=None, max_length=36), limit: int = Query(default=20, ge=1, le=50), customer: Customer = Depends(member), db: Session = Depends(get_db)):
    statement = select(ClubEntry).where(ClubEntry.customer_id == customer.id)
    if before:
        cursor = db.scalar(select(ClubEntry).where(ClubEntry.id == before, ClubEntry.customer_id == customer.id))
        if not cursor:
            raise HTTPException(404, "Transaction not found")
        statement = statement.where(or_(ClubEntry.created_at < cursor.created_at,
            and_(ClubEntry.created_at == cursor.created_at, ClubEntry.id < cursor.id)))
    entries = db.scalars(statement.order_by(ClubEntry.created_at.desc(), ClubEntry.id.desc()).limit(limit + 1)).all()
    page = entries[:limit]
    return {"data": [{"id": e.id, "points": e.points, "description": e.description,
        "created_at": e.created_at.isoformat()} for e in page],
        "next_cursor": page[-1].id if len(entries) > limit else None}


class BranchLookup(BaseModel):
    barcode: str = Field(min_length=26, max_length=26)


@router.post("/v1/admin/club/lookup")
def branch_lookup(body: BranchLookup, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    # The printed pass identifies a member; it never grants redemption authority.
    if customer.role not in ("staff", "admin"):
        raise HTTPException(403, "Staff access required")
    if not re.fullmatch(r"CC1:[A-Za-z0-9_-]{22}", body.barcode):
        raise HTTPException(422, "Invalid membership barcode")
    raw = base64.urlsafe_b64decode(body.barcode[4:] + "==")
    if base64.urlsafe_b64encode(raw).decode().rstrip("=") != body.barcode[4:]:
        raise HTTPException(422, "Invalid membership barcode")
    target = db.get(Customer, str(UUID(bytes=raw)))
    if not target:
        raise HTTPException(404, "Member not found")
    value = account(db, target.id)
    tiers = [(0, "Silver"), (2000000, "Gold"), (5000000, "Diamond"), (10000000, "Platinum")]
    tier = next(name for threshold, name in reversed(tiers) if value.spend_minor >= threshold)
    payload = {"member_id": target.id, "name": " ".join(filter(None, [target.first_name, target.last_name])),
        "tier": tier, "points": value.points, "review_required": value.review_required}
    db.commit()
    return payload


class OrderEvent(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    order_id: str = Field(min_length=1, max_length=80)
    customer_id: str
    paid_minor: int = Field(ge=0, le=1000000000)
    refunded_minor: int = Field(default=0, ge=0, le=1000000000)
    currency: str = "KES"


@router.post("/v1/integrations/club/order-event")
async def order_event(request: Request, x_club_signature: str = Header(default=""), db: Session = Depends(get_db)):
    settings = get_settings()
    if not settings.club_event_secret:
        raise HTTPException(503, "Verified order integration is not configured")
    raw = await request.body()
    if len(raw) > 16384:
        raise HTTPException(413, "Event too large")
    expected = hmac.new(settings.club_event_secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_club_signature):
        raise HTTPException(401, "Invalid event signature")
    try:
        event = OrderEvent.model_validate_json(raw)
    except ValueError:
        raise HTTPException(422, "Invalid order event") from None
    return apply_order_event(event, db)


def apply_order_event(event: OrderEvent, db: Session):
    settings = get_settings()
    if event.currency != "KES" or event.refunded_minor > event.paid_minor:
        raise HTTPException(422, "Invalid qualifying spend")
    if not db.get(Customer, event.customer_id):
        raise HTTPException(404, "Member not found")
    value = account(db, event.customer_id)
    key = f"order-event:{event.event_id}"
    if db.scalar(select(ClubEntry).where(ClubEntry.event_key == key)):
        db.commit()
        return {"status": "duplicate"}
    order = db.get(ClubOrder, event.order_id)
    if order and (order.customer_id != event.customer_id or order.paid_minor != event.paid_minor):
        raise HTTPException(409, "Order identity or amount changed")
    if order and event.refunded_minor < order.refunded_minor:
        raise HTTPException(409, "Stale refund event")
    value.review_required = False
    delta = 0
    if not order:
        earned = event.paid_minor // settings.club_earn_minor
        order = ClubOrder(order_id=event.order_id, customer_id=event.customer_id,
            paid_minor=event.paid_minor, refunded_minor=0, points_awarded=earned, points_reversed=0, expired_reversed=0)
        db.add(order)
        value.spend_minor += event.paid_minor
        value.lifetime_points += earned
        delta = earned
    target = order.points_awarded - ((order.paid_minor-event.refunded_minor) // settings.club_earn_minor)
    delta -= target - order.points_reversed
    value.spend_minor -= event.refunded_minor - order.refunded_minor
    order.refunded_minor = event.refunded_minor
    order.points_reversed = target
    remaining = 0
    waived = 0
    if delta >= 0:
        debt_paid = min(value.debt, delta)
        value.debt -= debt_paid
        remaining = delta-debt_paid
        value.points += remaining
    else:
        expired = -sum(db.scalars(select(ClubEntry.points).where(
            ClubEntry.customer_id == event.customer_id, ClubEntry.order_id == event.order_id,
            ClubEntry.event_key.like("expiry:%"))).all())
        waived = min(-delta, max(0, expired-order.expired_reversed))
        order.expired_reversed += waived
        reclaim = -delta-waived
        debit = min(value.points, reclaim)
        consume(db, event.customer_id, debit)
        value.points -= debit
        value.debt += reclaim-debit
    db.add(ClubEntry(id=str(uuid4()), customer_id=event.customer_id, event_key=key,
        points=delta+waived, remaining=remaining, order_id=event.order_id, description=f"Order {event.order_id}: qualifying spend updated",
        expires_at=datetime.now(UTC)+timedelta(days=settings.club_expiry_days) if remaining else None))
    db.commit()
    from .routes_club_benefits import sync_referral
    sync_referral(event.customer_id, event.order_id, None, db)
    return {"status": "accepted"}


class Redeem(BaseModel):
    points: int = Field(ge=100, le=500)
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")


@router.post("/v1/club/redeem")
async def redeem(payload: Redeem, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    settings = get_settings()
    if not settings.woocommerce_consumer_key or not settings.woocommerce_consumer_secret:
        raise HTTPException(503, "Reward coupon issuing is not connected yet")
    value = account(db, customer.id)
    record = db.scalar(select(ClubRedemption).where(
        ClubRedemption.customer_id == customer.id, ClubRedemption.request_key == payload.request_key))
    if record and record.points != payload.points:
        raise HTTPException(409, "This request was used for another reward")
    if value.review_required:
        raise HTTPException(409, "An order requires staff reconciliation before redemption")
    if not record:
        if value.debt or value.points < payload.points:
            raise HTTPException(409, "Insufficient available points")
        consume(db, customer.id, payload.points)
        value.points -= payload.points
        identity = str(uuid4())
        record = ClubRedemption(id=identity, customer_id=customer.id,
            request_key=payload.request_key, points=payload.points, code=f"ccclub-{uuid4().hex}")
        db.add(record)
        db.add(ClubEntry(id=str(uuid4()), customer_id=customer.id,
            event_key=f"redeem:{identity}", points=-payload.points, remaining=0,
            description="Points reserved for reward coupon"))
    db.commit()
    if record.status != "issued":
        # Deterministic coupon code lets a retry recover an ambiguous provider
        # response without spending points again or issuing another coupon.
        try:
            async with httpx.AsyncClient(timeout=15, auth=(settings.woocommerce_consumer_key, settings.woocommerce_consumer_secret)) as client:
                endpoint = settings.woocommerce_api_url + "/coupons"
                response = await client.get(endpoint, params={"code": record.code})
                response.raise_for_status()
                coupons = response.json()
                if not isinstance(coupons, list) or len(coupons) > 1:
                    raise ValueError("Invalid coupon lookup")
                confirmed = coupons[0] if coupons else None
                if not coupons:
                    amount = record.points*settings.club_point_value_minor/100
                    response = await client.post(endpoint, json={"code": record.code,
                        "discount_type": "fixed_cart", "amount": f"{amount:.2f}",
                        "individual_use": True, "usage_limit": 1, "usage_limit_per_user": 1,
                        "email_restrictions": [customer.email], "minimum_amount": f"{amount*10:.2f}",
                        "date_expires_gmt": (datetime.now(UTC)+timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S")})
                    response.raise_for_status()
                    confirmed = response.json()
                if not isinstance(confirmed, dict) or not isinstance(confirmed.get("id"), int) or confirmed["id"] < 1 or confirmed.get("code") != record.code:
                    raise ValueError("Coupon issuing could not be verified")
                record.status = "issued"
                db.commit()
        except (httpx.HTTPError, ValueError):
            return {"id": record.id, "status": "pending", "code": None}
    return {"id": record.id, "status": "issued", "code": record.code}
