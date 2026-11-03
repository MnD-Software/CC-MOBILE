"""App-owned commerce records. No website IDs are used as order identities."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class AppProduct(Base):
    __tablename__ = "app_products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    slug: Mapped[str] = mapped_column(String(240), unique=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    price_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allocation: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    sold: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (CheckConstraint("allocation >= 0 AND reserved >= 0 AND sold >= 0 AND reserved + sold <= allocation"),)


class AppMedia(Base):
    __tablename__ = "app_media"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_url: Mapped[str] = mapped_column(Text, unique=True)
    mime: Mapped[str] = mapped_column(String(80))
    data: Mapped[bytes] = mapped_column(LargeBinary)


class AppPage(Base):
    __tablename__ = "app_pages"
    slug: Mapped[str] = mapped_column(String(240), primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[str] = mapped_column(String(64))
    published: Mapped[bool] = mapped_column(Boolean, default=True)


class AppDeliveryZone(Base):
    __tablename__ = "app_delivery_zones"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    fee_minor: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class AppCoupon(Base):
    __tablename__ = "app_coupons"
    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    minimum_minor: Mapped[int] = mapped_column(Integer, default=0)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    usage_limit: Mapped[int] = mapped_column(Integer, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AppQuote(Base):
    __tablename__ = "app_quotes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    request_digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AppPolicy(Base):
    __tablename__ = "app_commerce_policies"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)


class AppOrder(Base):
    __tablename__ = "app_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference: Mapped[str] = mapped_column(String(50), unique=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    request_digest: Mapped[str] = mapped_column(String(64))
    channel: Mapped[str] = mapped_column(String(12), default="app")
    environment: Mapped[str] = mapped_column(String(12))
    account_id: Mapped[str] = mapped_column(String(80))
    account_fingerprint: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(24), default="awaiting_payment")
    payment_state: Mapped[str] = mapped_column(String(24), default="not_started")
    tracking_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)
    payment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    total_minor: Mapped[int] = mapped_column(Integer)
    subtotal_minor: Mapped[int] = mapped_column(Integer)
    discount_minor: Mapped[int] = mapped_column(Integer)
    delivery_minor: Mapped[int] = mapped_column(Integer)
    inventory_state: Mapped[str] = mapped_column(String(16), default="reserved")
    coupon_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("customer_id", "request_key"),)


class AppOrderEvent(Base):
    __tablename__ = "app_order_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), index=True)
    event_key: Mapped[str] = mapped_column(String(160), unique=True)
    kind: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SalesRecord(Base):
    __tablename__ = "channel_sales"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    channel: Mapped[str] = mapped_column(String(12), index=True)
    reference: Mapped[str] = mapped_column(String(100))
    environment: Mapped[str] = mapped_column(String(12))
    account_id: Mapped[str] = mapped_column(String(80), default="")
    currency: Mapped[str] = mapped_column(String(3), default="KES")
    paid_minor: Mapped[int] = mapped_column(Integer)
    reversed_minor: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("channel", "reference", "environment"),)


class CommerceIssue(Base):
    __tablename__ = "commerce_issues"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    channel: Mapped[str] = mapped_column(String(12), index=True)
    reference: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("channel", "reference", "kind"),)
