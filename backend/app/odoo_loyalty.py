"""Odoo is the sole balance authority when explicitly activated."""
from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .commerce_models import AppCoupon
from .config import get_settings
from .odoo_client import OdooClient


def authoritative():
    s = get_settings()
    if s.odoo_loyalty_authority and not s.odoo_enabled:
        raise HTTPException(503, "Odoo loyalty is selected but its connection is disabled.")
    return s.odoo_loyalty_authority


def local_mutation_guard():
    if authoritative():
        raise HTTPException(409, "Odoo manages this member's rewards. Make the change in Odoo.")


async def overview(customer_id):
    result = await OdooClient().bridge("club_overview", customer_id=customer_id)
    if not isinstance(result, dict) or result.get("member_id") != customer_id:
        raise HTTPException(502, "Odoo returned an invalid membership mapping.")
    if type(result.get("points")) is not int or result["points"] < 0:
        raise HTTPException(502, "Odoo loyalty points must match the app's integer-points contract.")
    return result


async def transactions(customer_id, before, limit):
    result = await OdooClient().bridge("club_transactions", customer_id=customer_id, before=before, limit=limit)
    if not isinstance(result, dict) or not isinstance(result.get("data"), list):
        raise HTTPException(502, "Odoo returned invalid loyalty history.")
    return result


class Reward(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    customer_id: str
    request_key: str
    points: int = Field(gt=0)
    code: str = Field(min_length=1, max_length=100)
    amount_minor: int = Field(gt=0, le=1000000000)
    minimum_minor: int = Field(ge=0, le=1000000000)
    expires_at: datetime
    status: str = Field(pattern="^issued$")


async def redeem(db, customer_id, points, request_key):
    result = await OdooClient().bridge("club_redeem", customer_id=customer_id, points=points, request_key=request_key)
    try:
        reward = Reward.model_validate(result)
        if ((reward.customer_id, reward.points, reward.request_key) != (customer_id, points, request_key)
                or reward.expires_at.tzinfo is None):
            raise ValueError()
    except ValueError:
        raise HTTPException(502, "Odoo returned an invalid reward. Retry using the same request key.") from None
    current = db.get(AppCoupon, reward.code)
    if current:
        if (current.customer_id, current.amount_minor, current.minimum_minor) != (customer_id, reward.amount_minor, reward.minimum_minor):
            raise HTTPException(409, "Odoo reward code conflicts with an existing app coupon.")
    else:
        db.add(AppCoupon(code=reward.code, customer_id=customer_id, amount_minor=reward.amount_minor,
            minimum_minor=reward.minimum_minor, usage_limit=1, expires_at=reward.expires_at))
        db.commit()
    return {"id": reward.id, "status": reward.status, "code": reward.code}
