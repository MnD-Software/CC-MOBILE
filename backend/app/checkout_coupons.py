"""Private coupon discovery. Quotes, not this advisory list, authorize discounts."""
from datetime import UTC, datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from .app_commerce import utc
from .commerce_models import AppCoupon
from .db import get_db
from .routes_club import member

router = APIRouter(tags=["checkout-coupons"])


class AvailableCoupons(BaseModel):
    saved_codes: list[str] = Field(default_factory=list, max_length=20)
    subtotal_minor: int = Field(ge=0, le=2_000_000_000)


@router.post("/v1/account/coupons/available")
def available(data: AvailableCoupons, actor=Depends(member), db: Session = Depends(get_db)):
    codes = {value.strip().casefold() for value in data.saved_codes if 0 < len(value.strip()) <= 100}
    query = select(AppCoupon).where(AppCoupon.enabled.is_(True), or_(
        AppCoupon.customer_id == actor.id,
        (AppCoupon.customer_id.is_(None) & AppCoupon.code.in_(codes)),
    )).order_by(AppCoupon.amount_minor.desc(), AppCoupon.code).limit(100)
    offers = []
    for coupon in db.scalars(query):
        if coupon.uses + coupon.reserved >= coupon.usage_limit or (coupon.expires_at and utc(coupon.expires_at) <= datetime.now(UTC)):
            continue
        offers.append({"code": coupon.code, "amount_minor": coupon.amount_minor,
            "minimum_minor": coupon.minimum_minor, "expires_at": coupon.expires_at,
            "eligible": data.subtotal_minor >= coupon.minimum_minor,
            "remaining_to_minimum_minor": max(0, coupon.minimum_minor - data.subtotal_minor)})
    return {"coupons": offers, "discount_confirmed_at_quote": True}
