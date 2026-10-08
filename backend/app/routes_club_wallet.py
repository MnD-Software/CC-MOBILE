from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ClubCoupon, ClubEntry, Customer
from .routes_club import account, consume, member
from .routes_enquiries import staff

router = APIRouter(tags=["club-wallet"])


class Codes(BaseModel):
    codes: list[str] = Field(max_length=20)


@router.get("/v1/club/coupons")
def saved(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return list(db.scalars(select(ClubCoupon.code).where(ClubCoupon.customer_id == customer.id).order_by(ClubCoupon.code)))


@router.post("/v1/club/coupons")
def merge(data: Codes, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    account(db, customer.id)
    incoming = set()
    for value in data.codes:
        code = value.strip().lower()
        if not code or len(code) > 100 or any(ord(char) < 32 or ord(char) == 127 for char in code):
            raise HTTPException(422, "Invalid coupon code")
        incoming.add(code)
    current = set(db.scalars(select(ClubCoupon.code).where(ClubCoupon.customer_id == customer.id)))
    if len(current | incoming) > 20:
        raise HTTPException(409, "Cloud wallet is full. Remove a code before syncing more.")
    for code in incoming-current:
        db.add(ClubCoupon(customer_id=customer.id, code=code))
    db.commit()
    return sorted(current | incoming)


class RemoveCode(BaseModel):
    code: str = Field(min_length=1, max_length=100)


@router.post("/v1/club/coupons/remove")
def remove(data: RemoveCode, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    record = db.get(ClubCoupon, (customer.id, data.code.strip().lower()))
    if record:
        db.delete(record)
        db.commit()
    return {"status": "removed"}


class Adjustment(BaseModel):
    points: int = Field(ge=-10000, le=10000)
    reason: str = Field(min_length=10, max_length=160)
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")


@router.post("/v1/admin/club/{customer_id}/adjust")
def adjust(customer_id: str, data: Adjustment, actor: Customer = Depends(staff), db: Session = Depends(get_db)):
    if not data.points or not db.get(Customer, customer_id):
        raise HTTPException(422, "A member and non-zero adjustment are required")
    value = account(db, customer_id)
    key = f"adjust:{customer_id}:{data.request_key}"
    old = db.scalar(select(ClubEntry).where(ClubEntry.event_key == key))
    if old:
        if old.points != data.points:
            raise HTTPException(409, "Adjustment request already used")
        db.commit()
        return {"status": "duplicate"}
    remaining = 0
    if data.points > 0:
        debt_paid = min(value.debt, data.points)
        value.debt -= debt_paid
        remaining = data.points-debt_paid
        value.points += remaining
    else:
        if value.points < -data.points:
            raise HTTPException(409, "Adjustment exceeds available balance")
        consume(db, customer_id, -data.points)
        value.points += data.points
    db.add(ClubEntry(id=str(uuid4()), customer_id=customer_id, event_key=key, points=data.points,
        remaining=remaining, description=data.reason.strip(), actor_id=actor.id,
        expires_at=datetime.now(UTC)+timedelta(days=get_settings().club_expiry_days) if remaining else None))
    db.commit()
    return {"status": "adjusted"}
