"""Durable account inbox, session-bound devices, push jobs and private order reviews."""
from datetime import UTC, datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    order_updates: Mapped[bool] = mapped_column(Boolean, default=True)


class PushDevice(Base):
    __tablename__ = "push_devices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    token: Mapped[str] = mapped_column(String(250), unique=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    session_hash: Mapped[str] = mapped_column(String(64), index=True)
    platform: Mapped[str] = mapped_column(String(10))
    generation: Mapped[str] = mapped_column(String(36))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AccountNotification(Base):
    __tablename__ = "account_notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    event_key: Mapped[str] = mapped_column(String(200), unique=True)
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(400))
    data: Mapped[dict] = mapped_column(JSON)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)


class PushJob(Base):
    __tablename__ = "push_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    notification_id: Mapped[str] = mapped_column(ForeignKey("account_notifications.id"))
    device_id: Mapped[str] = mapped_column(ForeignKey("push_devices.id"))
    generation: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    ticket: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error: Mapped[str] = mapped_column(String(60), default="")
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("notification_id", "device_id"),)


class OrderReview(Base):
    __tablename__ = "app_order_reviews"
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("rating >= 1 AND rating <= 5"),)
