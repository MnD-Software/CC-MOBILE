"""Additive, independent business ledgers; no existing table changes."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class RiderEarning(Base):
    __tablename__ = "rider_earnings"
    task_id: Mapped[str] = mapped_column(ForeignKey("logistics_tasks.id"), primary_key=True)
    rider_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    distance_meters: Mapped[int] = mapped_column(Integer)
    tariff: Mapped[dict] = mapped_column(JSON)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RiderPayment(Base):
    __tablename__ = "rider_payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("rider_earnings.task_id"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    amount_minor: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str] = mapped_column(String(160), unique=True)
    recorded_by: Mapped[str] = mapped_column(ForeignKey("customers.id"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("task_id", "request_key"),)


class CorporateAssignment(Base):
    __tablename__ = "corporate_assignments"
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    assigned_by: Mapped[str] = mapped_column(ForeignKey("customers.id"))


class CorporateActivity(Base):
    __tablename__ = "corporate_activities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("customers.id"))
    stage: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text)
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CorporateDocument(Base):
    __tablename__ = "corporate_documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("customers.id"))
    request_key: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="draft")
    payload: Mapped[dict] = mapped_column(JSON)
    total_minor: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("organization_id", "request_key"),)


class CorporatePaymentReference(Base):
    __tablename__ = "corporate_payment_references"
    reference: Mapped[str] = mapped_column(String(160), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("corporate_documents.id"), unique=True)


class CorporateAttachment(Base):
    __tablename__ = "corporate_attachments"
    document_id: Mapped[str] = mapped_column(ForeignKey("corporate_documents.id"), primary_key=True)
    mime: Mapped[str] = mapped_column(String(60))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("customers.id"))
