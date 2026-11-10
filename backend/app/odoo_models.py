"""Durable Odoo identities, incoming versions, feed cursor and transactional outbox."""
from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class OdooBinding(Base):
    __tablename__ = "odoo_bindings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(80))
    resource: Mapped[str] = mapped_column(String(40))
    external_id: Mapped[str] = mapped_column(String(160))
    local_id: Mapped[str] = mapped_column(String(160))
    version: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("source", "resource", "external_id"),
                     UniqueConstraint("source", "resource", "local_id"))


class OdooInbox(Base):
    __tablename__ = "odoo_inbox"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    digest: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OdooCursor(Base):
    __tablename__ = "odoo_cursors"
    source: Mapped[str] = mapped_column(String(80), primary_key=True)
    cursor: Mapped[int] = mapped_column(Integer, default=0)
    last_success: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OdooOutbox(Base):
    __tablename__ = "odoo_outbox"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source: Mapped[str] = mapped_column(String(80), index=True)
    kind: Mapped[str] = mapped_column(String(60))
    aggregate: Mapped[str] = mapped_column(String(160), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
