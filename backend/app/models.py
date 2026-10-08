from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Integer, UniqueConstraint, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="customer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    customer: Mapped[Customer] = relationship(back_populates="refresh_tokens")


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    recipient_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(40))
    line1: Mapped[str] = mapped_column(String(200))
    line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    area: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(100))
    delivery_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class ClubAccount(Base):
    __tablename__ = "club_accounts"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    debt: Mapped[int] = mapped_column(Integer, default=0)
    lifetime_points: Mapped[int] = mapped_column(Integer, default=0)
    spend_minor: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (CheckConstraint("points >= 0"),)


class ClubEntry(Base):
    __tablename__ = "club_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    event_key: Mapped[str] = mapped_column(String(160), unique=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    order_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    points: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(240))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remaining: Mapped[int] = mapped_column(Integer, default=0)


class ClubOrder(Base):
    __tablename__ = "club_orders"
    order_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    paid_minor: Mapped[int] = mapped_column(Integer)
    refunded_minor: Mapped[int] = mapped_column(Integer, default=0)
    points_awarded: Mapped[int] = mapped_column(Integer)
    points_reversed: Mapped[int] = mapped_column(Integer, default=0)
    expired_reversed: Mapped[int] = mapped_column(Integer, default=0)


class ClubRedemption(Base):
    __tablename__ = "club_redemptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    points: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(80), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    __table_args__ = (UniqueConstraint("customer_id", "request_key"),)


class Celebration(Base):
    __tablename__ = "celebrations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    occasion: Mapped[str] = mapped_column(String(30))
    month: Mapped[int] = mapped_column(Integer)
    day: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(String(400), default="")


class Enquiry(Base):
    __tablename__ = "enquiries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(30))
    subject: Mapped[str] = mapped_column(String(160))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    quote_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quote_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    staff_response: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("customer_id", "request_key"),)


class PairingRule(Base):
    __tablename__ = "pairing_rules"
    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    priority: Mapped[int] = mapped_column(Integer)


class WooOrderLink(Base):
    __tablename__ = "woo_order_links"
    order_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)


class ClubCoupon(Base):
    __tablename__ = "club_coupons"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(100), primary_key=True)


class ClubProfile(Base):
    __tablename__ = "club_profiles"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    birthday_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birthday_day: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ClubReferral(Base):
    __tablename__ = "club_referrals"
    referee_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    inviter_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    order_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reward_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
