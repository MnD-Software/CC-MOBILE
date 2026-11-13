"""Private coupon discovery. Quotes, not this advisory list, authorize discounts."""
from datetime import UTC, datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session
from .app_commerce import utc
from .commerce_models import AppCoupon, AppOrder
from .models import Customer
from .db import get_db
from .routes_club import member

router = APIRouter(tags=["checkout-coupons"])


def welcome(db, actor):
    if actor.role != "customer": return None
    db.execute(update(Customer).where(Customer.id == actor.id).values(first_name=Customer.first_name))
    if db.scalar(select(AppOrder.id).where(AppOrder.customer_id == actor.id, AppOrder.payment_state == "completed").limit(1)):
        return None
    code = "welcome-"+actor.id
    row = db.get(AppCoupon, code)
    if row is None:
        row = AppCoupon(code=code, customer_id=actor.id, amount_minor=10000, minimum_minor=0, usage_limit=1)
        db.add(row)
        db.flush()
    return row if row.enabled and row.uses+row.reserved < row.usage_limit else None


@router.post("/v1/account/coupons/welcome")
def claim_welcome(actor=Depends(member), db: Session = Depends(get_db)):
    row = welcome(db, actor)
    db.commit()
    return {"coupon": {"code": row.code, "amount_minor": row.amount_minor, "minimum_minor": row.minimum_minor, "terms": "KES 100 off your first order. One use per account; cannot be combined with another coupon."} if row else None}


class AvailableCoupons(BaseModel):
    saved_codes: list[str] = Field(default_factory=list, max_length=20)
    subtotal_minor: int = Field(ge=0, le=2_000_000_000)


@router.post("/v1/account/coupons/available")
def available(data: AvailableCoupons, actor=Depends(member), db: Session = Depends(get_db)):
    welcome(db, actor)
    db.commit()
    codes = {value.strip().casefold() for value in data.saved_codes if 0 < len(value.strip()) <= 100}
    query = select(AppCoupon).where(AppCoupon.enabled.is_(True), or_(
        AppCoupon.customer_id == actor.id,
        (AppCoupon.customer_id.is_(None) & AppCoupon.code.in_(codes)),
    )).order_by(AppCoupon.amount_minor.desc(), AppCoupon.code).limit(100)
    offers = []
    for coupon in db.scalars(query):
        if coupon.code.startswith("welcome-") and db.scalar(select(AppOrder.id).where(AppOrder.customer_id == actor.id, AppOrder.payment_state == "completed").limit(1)):
            continue
        if coupon.uses + coupon.reserved >= coupon.usage_limit or (coupon.expires_at and utc(coupon.expires_at) <= datetime.now(UTC)):
            continue
        offers.append({"code": coupon.code, "amount_minor": coupon.amount_minor,
            "minimum_minor": coupon.minimum_minor, "expires_at": coupon.expires_at,
            "eligible": data.subtotal_minor >= coupon.minimum_minor,
            "remaining_to_minimum_minor": max(0, coupon.minimum_minor - data.subtotal_minor)})
    return {"coupons": offers, "discount_confirmed_at_quote": True}
