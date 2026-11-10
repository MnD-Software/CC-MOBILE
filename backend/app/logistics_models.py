"""App-owned kitchen assignments and individual dispatch tasks, independent of Odoo."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class ProductionTask(Base):
    __tablename__ = "production_tasks"
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), primary_key=True)
    plant: Mapped[str] = mapped_column(String(100))
    assigned_to: Mapped[str] = mapped_column(ForeignKey("customers.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1)


class LogisticsScope(Base):
    __tablename__ = "logistics_scopes"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    plant: Mapped[str] = mapped_column(String(100), primary_key=True)


class LogisticsTask(Base):
    __tablename__ = "logistics_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), index=True)
    plant: Mapped[str] = mapped_column(String(100))
    service_type: Mapped[str] = mapped_column(String(30))
    rider_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id"), nullable=True, index=True)
    resource_type: Mapped[str] = mapped_column(String(30), default="internal_rider")
    external_reason: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(24), default="assigned", index=True)
    destination: Mapped[str] = mapped_column(String(500))
    recipient: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(40))
    items: Mapped[list] = mapped_column(JSON)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    slot: Mapped[str] = mapped_column(String(80), default="")
    pv_reference: Mapped[str] = mapped_column(String(100), default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LogisticsEvent(Base):
    __tablename__ = "logistics_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("logistics_tasks.id"), index=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(Text, default="")
    proof: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
