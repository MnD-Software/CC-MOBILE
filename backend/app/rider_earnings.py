"""Scoped rider remuneration and auditable payment recording, never a money transfer."""
from datetime import UTC, date, datetime, time, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import Customer
from .routes_club import member
from .commerce_models import AppOrder
from .logistics import DISPATCH, RIDERS, allowed_plant, require_plant
from .logistics_models import LogisticsTask
from .ecosystem_models import RiderEarning, RiderPayment
from .permissions import audit
from .excel_report import workbook_response

router = APIRouter(prefix="/v1/rider-earnings", tags=["rider-earnings"])
KENYA = timezone(timedelta(hours=3))
TARIFF = {"version": "owner-2026-11-13", "base_minor": 8500, "per_km_minor": 1500,
          "formula": "base_plus_distance", "service_type": "delivery"}


def actor(person=Depends(member)):
    if person.role not in DISPATCH | RIDERS | {"finance"}:
        raise HTTPException(403, "Rider payment workspace access required.")
    return person


def managed(db, person, identity):
    if person.role not in DISPATCH:
        raise HTTPException(403, "Dispatch approval required.")
    db.execute(update(LogisticsTask).where(LogisticsTask.id == identity).values(revision=LogisticsTask.revision))
    task = db.get(LogisticsTask, identity)
    if not task:
        raise HTTPException(404, "Trip not found.")
    require_plant(db, person, task.plant)
    return task


def view(db, task):
    earning = db.get(RiderEarning, task.id)
    if earning and earning.rider_id != task.rider_id:
        earning = None
    payments = list(db.scalars(select(RiderPayment).where(RiderPayment.task_id == task.id).order_by(RiderPayment.created_at)))
    paid = sum(p.amount_minor for p in payments)
    earned = task.status == "delivered" and earning is not None
    amount = earning.amount_minor if earning else None
    approved = bool(earned and earning.approved_at)
    person = db.get(Customer, task.rider_id) if task.rider_id else None
    return {"task_id": task.id, "reference": db.get(AppOrder, task.order_id).reference,
            "rider_id": task.rider_id, "rider_name": " ".join([person.first_name, person.last_name]) if person else "Unassigned",
            "service_type": task.service_type, "trip_status": task.status, "created_at": task.created_at,
            "distance_meters": earning.distance_meters if earning else None,
            "amount_minor": amount, "earned_minor": amount if earned else 0,
            "approved_minor": amount if approved else 0, "paid_minor": paid,
            "balance_minor": amount-paid if approved else 0,
            "status": "cancelled" if task.status == "cancelled" else "tariff_pending" if not earning else "paid" if approved and paid == amount else "part_paid" if paid else "approved" if approved else "earned" if earned else "estimated",
            "tariff": earning.tariff if earning else None,
            "payments": [{"id": p.id, "amount_minor": p.amount_minor, "reference": p.reference, "paid_at": p.paid_at} for p in payments]}


def records(db, person, from_date=None, to_date=None):
    if from_date and to_date and (to_date < from_date or (to_date-from_date).days > 366):
        raise HTTPException(422, "Choose a date range of up to 366 days.")
    query = select(LogisticsTask).where(LogisticsTask.rider_id.is_not(None))
    if person.role in RIDERS:
        query = query.where(LogisticsTask.rider_id == person.id)
    if from_date: query = query.where(LogisticsTask.created_at >= datetime.combine(from_date, time.min, KENYA).astimezone(UTC))
    if to_date: query = query.where(LogisticsTask.created_at < datetime.combine(to_date+timedelta(days=1), time.min, KENYA).astimezone(UTC))
    return [view(db, t) for t in db.scalars(query.order_by(LogisticsTask.created_at.desc()))
            if person.role in RIDERS | {"finance"} or allowed_plant(db, person, t.plant)]


@router.get("")
def listing(from_date: date | None = None, to_date: date | None = None, person=Depends(actor), db: Session = Depends(get_db)):
    rows = records(db, person, from_date, to_date)
    return {"trips": rows, "totals": {k: sum(r[k] for r in rows) for k in ["earned_minor", "approved_minor", "paid_minor", "balance_minor"]}, "tariff": TARIFF}


class FareInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    distance_meters: int = Field(strict=True, gt=0, le=500000)


@router.put("/{identity}/estimate")
def estimate(identity: str, data: FareInput, person=Depends(actor), db: Session = Depends(get_db)):
    task = managed(db, person, identity)
    if not task.rider_id or task.status == "cancelled" or task.resource_type != "internal_rider" or task.service_type != "delivery":
        raise HTTPException(409, "This service/resource needs a separately approved tariff.")
    row = db.get(RiderEarning, identity)
    if row and row.approved_at:
        if row.distance_meters == data.distance_meters and row.rider_id == task.rider_id: return view(db, task)
        raise HTTPException(409, "Approved earnings cannot be repriced.")
    amount = 8500 + (data.distance_meters * 1500 + 500)//1000
    if not row:
        row = RiderEarning(task_id=identity, rider_id=task.rider_id, amount_minor=amount, distance_meters=data.distance_meters, tariff=TARIFF)
        db.add(row)
    else:
        row.rider_id, row.amount_minor, row.distance_meters, row.tariff = task.rider_id, amount, data.distance_meters, dict(TARIFF)
    audit(db, person.id, "rider.fare_confirmed", identity, amount_minor=amount, distance_meters=data.distance_meters)
    db.commit()
    return view(db, task)


@router.post("/{identity}/approve")
def approve(identity: str, person=Depends(actor), db: Session = Depends(get_db)):
    task = managed(db, person, identity)
    row = db.get(RiderEarning, identity)
    if task.status != "delivered" or not row or row.rider_id != task.rider_id:
        raise HTTPException(409, "Complete the delivery and confirm its rider fare first.")
    if not row.approved_at:
        row.approved_by, row.approved_at = person.id, datetime.now(UTC)
        audit(db, person.id, "rider.earning_approved", identity, amount_minor=row.amount_minor)
    db.commit()
    return view(db, task)


class PaymentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_key: str = Field(min_length=16, max_length=80)
    amount_minor: int = Field(strict=True, gt=0, le=100000000)
    reference: str = Field(min_length=3, max_length=160)
    paid_at: datetime


@router.post("/{identity}/payments")
def payment(identity: str, data: PaymentInput, person=Depends(actor), db: Session = Depends(get_db)):
    task = managed(db, person, identity)
    row = db.get(RiderEarning, identity)
    if not row or not row.approved_at or task.status != "delivered" or row.rider_id != task.rider_id:
        raise HTTPException(409, "Approve this delivered trip before recording payment.")
    if data.paid_at.tzinfo is None or data.paid_at > datetime.now(UTC)+timedelta(minutes=5):
        raise HTTPException(422, "Use a completed payment date with timezone.")
    old = db.scalar(select(RiderPayment).where(RiderPayment.task_id == identity, RiderPayment.request_key == data.request_key))
    if old:
        from .app_commerce import utc
        if (old.reference, old.amount_minor, utc(old.paid_at)) != (data.reference, data.amount_minor, data.paid_at):
            raise HTTPException(409, "Payment request was already used with other details.")
        return view(db, task)
    if db.scalar(select(RiderPayment.id).where(RiderPayment.reference == data.reference)):
        raise HTTPException(409, "This payment reference is already recorded.")
    balance = row.amount_minor - sum(db.scalars(select(RiderPayment.amount_minor).where(RiderPayment.task_id == identity)))
    if data.amount_minor > balance:
        raise HTTPException(409, "Payment exceeds the outstanding approved amount.")
    db.add(RiderPayment(id=str(uuid4()), task_id=identity, **data.model_dump(), recorded_by=person.id))
    audit(db, person.id, "rider.payment_recorded", identity, amount_minor=data.amount_minor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Payment reference or request is already recorded. Refresh the ledger.") from None
    return view(db, task)


@router.get("/report.xlsx")
def report(from_date: date | None = None, to_date: date | None = None, person=Depends(actor), db: Session = Depends(get_db)):
    rows = records(db, person, from_date, to_date)
    return workbook_response("rider-payments", ["Order", "Trip", "Rider", "Created", "Service", "Trip status", "Kilometres", "Expected KES", "Earned KES", "Approved KES", "Paid KES", "Balance KES", "Payout status", "Payment references"],
        [[r["reference"], r["task_id"], r["rider_name"], str(r["created_at"]), r["service_type"], r["trip_status"], r["distance_meters"]/1000 if r["distance_meters"] else "", r["amount_minor"]/100 if r["amount_minor"] is not None else "", *[r[k]/100 for k in ["earned_minor", "approved_minor", "paid_minor", "balance_minor"]], r["status"], ", ".join(p["reference"] for p in r["payments"])] for r in rows])
