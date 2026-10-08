from datetime import UTC, date, datetime, timedelta
from calendar import monthrange
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ClubEntry, ClubOrder, ClubProfile, ClubReferral, Customer
from .routes_club import account, consume, member

router = APIRouter(tags=["club-benefits"])


def local_today():
    return (datetime.now(UTC)+timedelta(hours=3)).date()


def grant(db, value, key, points, description):
    debt_paid = min(value.debt, points)
    value.debt -= debt_paid
    remaining = points-debt_paid
    value.points += remaining
    db.add(ClubEntry(id=str(uuid4()), customer_id=value.customer_id, event_key=key,
        points=points, remaining=remaining, description=description,
        expires_at=datetime.now(UTC)+timedelta(days=get_settings().club_expiry_days)))


@router.get("/v1/club/benefits")
def benefits(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    profile = db.get(ClubProfile, customer.id)
    applied = db.get(ClubReferral, customer.id)
    referrals = db.scalars(select(ClubReferral).where(ClubReferral.inviter_id == customer.id)).all()
    return {"referral_code": "CC-"+customer.id,
        "referral_status": applied.status if applied else None,
        "referrals_completed": sum(item.status == "earned" for item in referrals),
        "referral_points": 50, "referral_minimum_kes": 2000, "referral_annual_limit": 10,
        "birthday": {"month": profile.birthday_month, "day": profile.birthday_day} if profile and profile.birthday_month else None,
        "birthday_claimed": bool(db.scalar(select(ClubEntry.id).where(ClubEntry.event_key == f"birthday:{customer.id}:{local_today().year}")))}


class Birthday(BaseModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)

    @model_validator(mode="after")
    def valid(self):
        date(2000, self.month, self.day)
        return self


@router.put("/v1/club/birthday")
def save_birthday(data: Birthday, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    account(db, customer.id)
    profile = db.get(ClubProfile, customer.id)
    if profile and profile.birthday_month and (profile.birthday_month, profile.birthday_day) != (data.month, data.day):
        raise HTTPException(409, "Contact support to correct your saved birthday")
    if not profile:
        profile = ClubProfile(customer_id=customer.id)
        db.add(profile)
    profile.birthday_month, profile.birthday_day = data.month, data.day
    db.commit()
    return {"status": "saved"}


@router.post("/v1/club/birthday/claim")
def claim_birthday(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    value = account(db, customer.id)
    today = local_today()
    if value.review_required:
        raise HTTPException(409, "An order needs staff reconciliation before this benefit is available")
    profile = db.get(ClubProfile, customer.id)
    birthday = None
    if profile and profile.birthday_month and profile.birthday_day:
        birthday = (profile.birthday_month, min(profile.birthday_day, monthrange(today.year, profile.birthday_month)[1]))
    if birthday != (today.month, today.day):
        raise HTTPException(409, "Your birthday benefit is available on your saved birthday")
    created = customer.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    if (datetime.now(UTC)-created).days < 30 or value.spend_minor < 200000:
        raise HTTPException(409, "Birthday benefits require 30 days of membership and KES 2,000 qualifying spend")
    key = f"birthday:{customer.id}:{today.year}"
    if db.scalar(select(ClubEntry.id).where(ClubEntry.event_key == key)):
        db.commit()
        return {"status": "already_claimed"}
    points = 150 if value.spend_minor >= 10000000 else 100 if value.spend_minor >= 5000000 else 75 if value.spend_minor >= 2000000 else 50
    grant(db, value, key, points, "Annual birthday benefit")
    db.commit()
    return {"status": "awarded", "points": points}


class ReferralInput(BaseModel):
    code: str = Field(min_length=3, max_length=80)


@router.post("/v1/club/referrals")
def apply_referral(data: ReferralInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    try:
        raw = data.code.strip()
        inviter = str(UUID(raw[3:] if raw[:3].upper() == "CC-" else raw))
    except ValueError:
        raise HTTPException(422, "Invalid referral code") from None
    if inviter == customer.id or not db.get(Customer, inviter):
        raise HTTPException(422, "Invalid referral code")
    # Sorted member locks prevent deadlocks and serialize competing reciprocal
    # referrals. Traversal rejects cycles before storing a new relationship.
    for identity in sorted((customer.id, inviter)):
        account(db, identity)
    existing = db.get(ClubReferral, customer.id)
    if existing:
        if existing.inviter_id != inviter:
            raise HTTPException(409, "A referral has already been applied")
        db.commit()
        return {"status": existing.status}
    if db.scalar(select(ClubOrder.order_id).where(ClubOrder.customer_id == customer.id)):
        raise HTTPException(409, "Apply a referral before your first qualifying order")
    cursor = inviter
    for _ in range(100):
        if cursor == customer.id:
            raise HTTPException(409, "Circular referrals are not allowed")
        previous = db.get(ClubReferral, cursor)
        if not previous:
            break
        cursor = previous.inviter_id
    else:
        raise HTTPException(409, "Referral requires staff review")
    db.add(ClubReferral(referee_id=customer.id, inviter_id=inviter))
    db.commit()
    return {"status": "pending"}


def sync_referral(customer_id, order_id, status, db):
    initial = db.get(ClubReferral, customer_id)
    if not initial:
        return
    identities = sorted((customer_id, initial.inviter_id))
    accounts = {identity: account(db, identity) for identity in identities}
    referral = db.get(ClubReferral, customer_id, populate_existing=True)
    order = db.get(ClubOrder, order_id, populate_existing=True)
    if not order:
        db.commit()
        return
    if referral.status == "pending" and referral.order_id is None:
        count_orders = db.scalar(select(func.count()).select_from(ClubOrder).where(ClubOrder.customer_id == customer_id))
        if count_orders == 1:
            referral.order_id = order_id
    key = f"referral:{customer_id}"
    if referral.status == "earned" and referral.order_id == order_id and order.refunded_minor > 0:
        value = accounts[referral.inviter_id]
        original = db.scalar(select(ClubEntry).where(ClubEntry.event_key == key))
        expired = db.scalar(select(ClubEntry.points).where(ClubEntry.event_key == f"expiry:{original.id}")) or 0
        reclaim = 50+expired
        debit = min(value.points, reclaim)
        consume(db, value.customer_id, debit)
        value.points -= debit
        value.debt += reclaim-debit
        db.add(ClubEntry(id=str(uuid4()), customer_id=value.customer_id, event_key=f"referral-reverse:{customer_id}", points=-reclaim, remaining=0, description="Referral reward reversed after refund"))
        referral.status = "reversed"
    elif referral.status == "pending" and status == "completed" and not order.refunded_minor and order.paid_minor >= 200000:
        # Only the first verified purchase can qualify, even if webhook delivery
        # arrives out of order for later purchases.
        year = local_today().year
        count = db.scalar(select(func.count()).select_from(ClubReferral).where(ClubReferral.inviter_id == referral.inviter_id, ClubReferral.reward_year == year))
        if referral.order_id == order_id and count < 10:
            grant(db, accounts[referral.inviter_id], key, 50, "A friend's first qualifying purchase")
            referral.status, referral.order_id, referral.reward_year = "earned", order_id, year
    db.commit()
