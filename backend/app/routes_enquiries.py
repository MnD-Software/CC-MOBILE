from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer, Enquiry
from .routes_club import account, member

router = APIRouter(tags=["enquiries"])


def staff(customer: Customer = Depends(member)):
    if customer.role not in ("admin", "staff"):
        raise HTTPException(403, "Staff access required")
    return customer


def output(record):
    return {key: getattr(record, key) for key in ("id", "kind", "subject", "details", "status", "quote_minor", "quote_expires_at", "staff_response", "revision", "created_at")}


class NewEnquiry(BaseModel):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    kind: Literal["custom_cake", "corporate", "support"]
    subject: str = Field(min_length=3, max_length=160)
    details: str = Field(min_length=10, max_length=4000)

    @model_validator(mode="after")
    def clean(self):
        self.subject = self.subject.strip()
        self.details = self.details.strip()
        if len(self.subject) < 3 or len(self.details) < 10:
            raise ValueError("Please describe your request")
        return self


@router.get("/v1/account/enquiries")
def mine(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return [output(record) for record in db.scalars(select(Enquiry).where(Enquiry.customer_id == customer.id).order_by(Enquiry.created_at.desc()).limit(100))]


@router.post("/v1/account/enquiries", status_code=201)
def submit(payload: NewEnquiry, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    account(db, customer.id)
    old = db.scalar(select(Enquiry).where(Enquiry.customer_id == customer.id, Enquiry.request_key == payload.request_key))
    if old:
        if (old.subject, old.details, old.kind) != (payload.subject, payload.details, payload.kind):
            raise HTTPException(409, "Request key already used")
        db.commit()
        return output(old)
    record = Enquiry(id=str(uuid4()), customer_id=customer.id, kind=payload.kind,
        request_key=payload.request_key, subject=payload.subject, details=payload.details)
    db.add(record)
    db.commit()
    return output(record)


class StaffReply(BaseModel):
    revision: int = Field(ge=1)
    status: Literal["reviewing", "quoted", "resolved", "declined"]
    response: str = Field(min_length=3, max_length=4000)
    quote_minor: int | None = Field(default=None, ge=100, le=1000000000)
    quote_expires_at: datetime | None = None


@router.get("/v1/admin/enquiries")
def queue(_: Customer = Depends(staff), db: Session = Depends(get_db)):
    return [dict(output(record), customer_id=record.customer_id) for record in db.scalars(select(Enquiry).order_by(Enquiry.created_at.desc()).limit(100))]


@router.patch("/v1/admin/enquiries/{identity}")
def reply(identity: str, data: StaffReply, _: Customer = Depends(staff), db: Session = Depends(get_db)):
    record = db.scalar(select(Enquiry).where(Enquiry.id == identity).with_for_update())
    if not record:
        raise HTTPException(404, "Request not found")
    if record.revision != data.revision or record.status in ("accepted", "resolved", "declined"):
        raise HTTPException(409, "Request changed or is already final")
    if data.status == "quoted":
        if record.kind == "support" or data.quote_minor is None or not data.quote_expires_at or data.quote_expires_at.tzinfo is None or data.quote_expires_at <= datetime.now(UTC):
            raise HTTPException(422, "A future, timezone-aware quote expiry and amount are required")
    record.status = data.status
    record.staff_response = data.response.strip()
    record.quote_minor = data.quote_minor if data.status == "quoted" else None
    record.quote_expires_at = data.quote_expires_at if data.status == "quoted" else None
    record.revision += 1
    db.commit()
    return output(record)


class AcceptQuote(BaseModel):
    revision: int = Field(ge=1)


@router.post("/v1/account/enquiries/{identity}/accept")
def accept(identity: str, data: AcceptQuote, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    account(db, customer.id)
    record = db.scalar(select(Enquiry).where(Enquiry.id == identity, Enquiry.customer_id == customer.id).with_for_update())
    if not record:
        raise HTTPException(404, "Request not found")
    if record.status == "accepted" and record.revision == data.revision+1:
        return output(record)
    expiry = record.quote_expires_at
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if record.status != "quoted" or record.revision != data.revision or not expiry or expiry <= datetime.now(UTC):
        raise HTTPException(409, "Quote changed or expired. Request an updated quote.")
    record.status = "accepted"
    record.revision += 1
    db.commit()
    return output(record)
