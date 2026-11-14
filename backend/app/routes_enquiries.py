from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import ForeignKey, String, select, update
from sqlalchemy.orm import Mapped, mapped_column, Session

from .db import Base, get_db
from .models import Customer, Enquiry, OrganizationEnquiry, OrganizationMember
from .permissions import require, audit
from .routes_club import account, member

router = APIRouter(tags=["enquiries"])


class OrderSupportLink(Base):
    __tablename__ = "order_support_links"
    enquiry_id: Mapped[str] = mapped_column(ForeignKey("enquiries.id"), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), index=True)
    category: Mapped[str] = mapped_column(String(30))


class OrderHelp(BaseModel):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    category: Literal["question", "delivery", "refund"]
    details: str = Field(min_length=10, max_length=4000)


@router.post("/v1/app-orders/{reference}/support", status_code=201)
def order_help(reference: str, data: OrderHelp, customer=Depends(member), db: Session = Depends(get_db)):
    from .commerce_models import AppOrder
    order = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == customer.id).with_for_update())
    if not order:
        raise HTTPException(404, "Order not found")
    details = data.details.strip()
    if len(details) < 10:
        raise HTTPException(422, "Describe your request in at least 10 characters.")
    if data.category == "refund" and order.payment_state not in {"completed", "reversed"}:
        raise HTTPException(409, "A refund review requires a confirmed payment. Choose payment help for a pending payment.")
    subject = f"{data.category.title()} request: {order.reference}"
    old = db.scalar(select(Enquiry).where(Enquiry.customer_id == customer.id, Enquiry.request_key == data.request_key))
    if old:
        link = db.get(OrderSupportLink, old.id)
        if not link or link.order_id != order.id or link.category != data.category or old.details != details:
            raise HTTPException(409, "This request key already belongs to another request.")
        return output(old)
    record = Enquiry(id=str(uuid4()), customer_id=customer.id, request_key=data.request_key, kind="support", subject=subject, details=details)
    db.add(record)
    db.flush()
    db.add(OrderSupportLink(enquiry_id=record.id, order_id=order.id, category=data.category))
    audit(db, customer.id, "order_support_requested", order.reference, category=data.category)
    db.commit()
    return output(record)


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
def queue(_: Customer = Depends(require("enquiries.read")), db: Session = Depends(get_db)):
    return [dict(output(record), customer_id=record.customer_id) for record in db.scalars(select(Enquiry).order_by(Enquiry.created_at.desc()).limit(100))]


@router.patch("/v1/admin/enquiries/{identity}")
def reply(identity: str, data: StaffReply, actor: Customer = Depends(require("enquiries.write")), db: Session = Depends(get_db)):
    if actor.role == 'call_center_agent':
        from .service_desk import access
        access(db,actor,'enquiry',identity)
    record = db.scalar(select(Enquiry).where(Enquiry.id == identity).with_for_update())
    if not record:
        raise HTTPException(404, "Request not found")
    if record.revision != data.revision or record.status in ("accepted", "resolved", "declined"):
        raise HTTPException(409, "Request changed or is already final")
    if data.status == "quoted":
        if record.kind == "support" or data.quote_minor is None or not data.quote_expires_at or data.quote_expires_at.tzinfo is None or data.quote_expires_at <= datetime.now(UTC):
            raise HTTPException(422, "A future, timezone-aware quote expiry and amount are required")
    if len(data.response.strip()) < 3:
        raise HTTPException(422, "A meaningful response is required")
    changed = db.execute(update(Enquiry).where(Enquiry.id == identity, Enquiry.revision == data.revision,
                         Enquiry.status.notin_(("accepted", "resolved", "declined"))).values(
                         status=data.status, staff_response=data.response.strip(), revision=Enquiry.revision + 1,
                         quote_minor=data.quote_minor if data.status == "quoted" else None,
                         quote_expires_at=data.quote_expires_at if data.status == "quoted" else None
                         ).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        raise HTTPException(409, "Request changed. Reload before replying.")
    audit(db, actor.id, "enquiry.replied", identity, status=data.status, revision=data.revision + 1)
    from .notifications import enqueue
    enqueue(db, record.customer_id, f"support:{identity}:{data.revision + 1}", "support_reply",
        "Your request has an update", "Our team has replied. Open Your requests to read the response.", {"url": "/requests"})
    db.commit()
    db.refresh(record)
    return output(record)


class AcceptQuote(BaseModel):
    revision: int = Field(ge=1)


@router.post("/v1/account/enquiries/{identity}/accept")
def accept(identity: str, data: AcceptQuote, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    corporate = db.get(OrganizationEnquiry, identity)
    if corporate:
        membership = db.get(OrganizationMember, (corporate.organization_id, customer.id))
        if not membership or membership.role not in ("owner", "approver"):
            raise HTTPException(403, "An organization approver must accept this quotation")
        raise HTTPException(409, "Accept corporate quotations through the organization's approval endpoint")
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
