"""Isolated simulated payments. Never import or mount this on app.main."""
from __future__ import annotations

import hashlib
import hmac
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import CheckConstraint, Integer, JSON, String, UniqueConstraint, create_engine, inspect, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class SandboxSettings(BaseSettings):
    # ENVIRONMENT also governs the live service; a client flag cannot override it.
    environment: str = Field(default="development", validation_alias="ENVIRONMENT")
    enabled: bool = False
    isolated: bool = False
    database_url: str = "sqlite:///./cakecity-payment-sandbox.db"
    access_token: str = ""
    webhook_secret: str = ""
    model_config = SettingsConfigDict(env_prefix="PAYMENT_SANDBOX_", extra="ignore")

    def validate_isolation(self):
        if self.environment.casefold() not in {"development", "local", "test", "staging", "review"}:
            raise RuntimeError("Payment sandbox is forbidden in this environment")
        if not self.enabled or not self.isolated:
            raise RuntimeError("Payment sandbox requires explicit enablement and isolation")
        if min(len(self.access_token), len(self.webhook_secret)) < 32 or self.access_token == self.webhook_secret:
            raise RuntimeError("Provision distinct sandbox access and webhook secrets of at least 32 characters")
        url = make_url(self.database_url)
        if url.drivername != "sqlite" or not url.database or url.database == ":memory:":
            raise RuntimeError("Payment sandbox requires a dedicated persistent SQLite test database")
        if "payment-sandbox" not in Path(url.database).name or url.query:
            raise RuntimeError("Dedicated database filename must contain payment-sandbox and have no URL options")


class SandboxBase(DeclarativeBase):
    """Separate metadata; commerce migrations never create these tables."""


class TestPayment(SandboxBase):
    __tablename__ = "sandbox_payments_v1"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    actor: Mapped[str] = mapped_column(String(64))
    request_key: Mapped[str] = mapped_column(String(80))
    fingerprint: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    amount_minor: Mapped[int] = mapped_column(Integer)
    refunded_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="KES")
    snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))
    __table_args__ = (
        UniqueConstraint("actor", "request_key"),
        CheckConstraint("amount_minor > 0 AND refunded_minor >= 0 AND refunded_minor <= amount_minor"),
    )


class TestPaymentEvent(SandboxBase):
    __tablename__ = "sandbox_payment_events_v1"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    payment_id: Mapped[str] = mapped_column(String(50), index=True)
    event_key: Mapped[str] = mapped_column(String(80))
    fingerprint: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(64))
    at: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("payment_id", "event_key"),)


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TestLine(StrictInput):
    sku: Literal["TEST-CAKE", "TEST-CANDLES"]
    quantity: int = Field(ge=1, le=10)


class InitiatePayment(StrictInput):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    lines: list[TestLine] = Field(min_length=1, max_length=10)


class SimulatedCallback(StrictInput):
    event_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    status: Literal["succeeded", "failed", "timed_out", "cancelled"]
    amount_minor: int = Field(ge=1, le=100_000_000)
    currency: Literal["KES"]


class RefundPayment(StrictInput):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    amount_minor: int = Field(ge=1, le=100_000_000)


# Deliberately synthetic fixtures. Never read WooCommerce or accept client prices.
TEST_CATALOGUE = {
    "TEST-CAKE": {"name": "TEST celebration cake", "unit_minor": 350_000},
    "TEST-CANDLES": {"name": "TEST candle pack", "unit_minor": 20_000},
}


def fingerprint(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def now() -> str:
    return datetime.now(UTC).isoformat()


class PaymentProvider(Protocol):
    """Contract for future approved adapters; none of these imply live availability."""
    def initiate_payment(self, data: InitiatePayment, actor: str) -> dict: ...
    def verify_payment(self, identity: str, actor: str) -> dict: ...
    def handle_webhook(self, identity: str, data: SimulatedCallback, actor: str) -> dict: ...
    def refund_payment(self, identity: str, data: RefundPayment, actor: str) -> dict: ...
    def get_transaction_status(self, identity: str, actor: str) -> dict: ...


class SimulatedPaymentProvider:
    def __init__(self, db: Session):
        self.db = db

    def owned(self, identity: str, actor: str) -> TestPayment:
        row = self.db.scalar(select(TestPayment).where(TestPayment.id == identity, TestPayment.actor == actor))
        if not row:
            raise HTTPException(404, "Simulated payment not found")
        return row

    def output(self, row: TestPayment) -> dict:
        return {"id": row.id, "simulated": True, "provider": "simulated", "status": row.status,
                "amount_minor": row.amount_minor, "refunded_minor": row.refunded_minor,
                "currency": row.currency, "created_at": row.created_at, "items": row.snapshot["items"]}

    def event(self, row: TestPayment, key: str, digest: str, kind: str, actor: str, details: dict):
        self.db.add(TestPaymentEvent(id=str(uuid4()), payment_id=row.id, event_key=key,
                                    fingerprint=digest, kind=kind, actor=actor, at=now(), details=details))

    def replay(self, row: TestPayment, key: str, digest: str) -> bool:
        old = self.db.scalar(select(TestPaymentEvent).where(TestPaymentEvent.payment_id == row.id, TestPaymentEvent.event_key == key))
        if old and old.fingerprint != digest:
            raise HTTPException(409, "Event key already used with different details")
        return old is not None

    def initiate_payment(self, data: InitiatePayment, actor: str) -> dict:
        digest = fingerprint(data.model_dump())
        old = self.db.scalar(select(TestPayment).where(TestPayment.actor == actor, TestPayment.request_key == data.request_key))
        if old:
            if old.fingerprint != digest:
                raise HTTPException(409, "Request key already used with a different cart")
            return self.output(old)
        items = [{"sku": line.sku, "quantity": line.quantity, **TEST_CATALOGUE[line.sku]} for line in data.lines]
        row = TestPayment(id="TEST-" + uuid4().hex, actor=actor, request_key=data.request_key,
                          fingerprint=digest, amount_minor=sum(line["unit_minor"] * line["quantity"] for line in items),
                          snapshot={"items": items}, created_at=now())
        self.db.add(row)
        self.event(row, "initiate", digest, "initiated", actor, {"amount_minor": row.amount_minor, "currency": "KES"})
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            # Database uniqueness serializes concurrent attempts across processes.
            old = self.db.scalar(select(TestPayment).where(TestPayment.actor == actor, TestPayment.request_key == data.request_key))
            if not old or old.fingerprint != digest:
                raise HTTPException(409, "Request key conflicts with an existing cart") from None
            row = old
        return self.output(row)

    def verify_payment(self, identity: str, actor: str) -> dict:
        return self.output(self.owned(identity, actor))

    def get_transaction_status(self, identity: str, actor: str) -> dict:
        return self.verify_payment(identity, actor)

    def handle_webhook(self, identity: str, data: SimulatedCallback, actor: str) -> dict:
        row = self.owned(identity, actor)
        digest = fingerprint({"operation": "callback", **data.model_dump()})
        if self.replay(row, data.event_key, digest):
            return self.output(row)
        if (row.amount_minor, row.currency) != (data.amount_minor, data.currency):
            raise HTTPException(409, "Simulated amount or currency does not reconcile")
        changed = self.db.execute(update(TestPayment).where(TestPayment.id == row.id, TestPayment.status == "pending")
                                  .values(status=data.status).execution_options(synchronize_session=False))
        if changed.rowcount != 1:
            self.db.rollback()
            row = self.owned(identity, actor)
            if self.replay(row, data.event_key, digest):
                return self.output(row)
            raise HTTPException(409, "Simulated payment is already terminal")
        self.event(row, data.event_key, digest, data.status, actor, {"amount_minor": data.amount_minor, "currency": data.currency})
        self.db.commit()
        self.db.refresh(row)
        return self.output(row)

    def refund_payment(self, identity: str, data: RefundPayment, actor: str) -> dict:
        row = self.owned(identity, actor)
        digest = fingerprint({"operation": "refund", **data.model_dump()})
        if self.replay(row, data.request_key, digest):
            return self.output(row)
        changed = self.db.execute(update(TestPayment).where(
            TestPayment.id == row.id, TestPayment.status == "succeeded",
            TestPayment.refunded_minor + data.amount_minor <= TestPayment.amount_minor,
        ).values(refunded_minor=TestPayment.refunded_minor + data.amount_minor).execution_options(synchronize_session=False))
        if changed.rowcount != 1:
            self.db.rollback()
            row = self.owned(identity, actor)
            if self.replay(row, data.request_key, digest):
                return self.output(row)
            raise HTTPException(409, "Only succeeded payments with sufficient unrefunded balance can be refunded")
        self.event(row, data.request_key, digest, "refund", actor, {"amount_minor": data.amount_minor, "currency": row.currency})
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            row = self.owned(identity, actor)
            if not self.replay(row, data.request_key, digest):
                raise HTTPException(409, "Refund conflicts with an existing event") from None
        self.db.refresh(row)
        return self.output(row)


def create_sandbox_app(settings: SandboxSettings | None = None) -> FastAPI:
    settings = settings or SandboxSettings()
    # Validate before creating an engine or touching a database, and at startup.
    settings.validate_isolation()
    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False, "timeout": 15})
    sessions = sessionmaker(bind=engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        settings.validate_isolation()
        inspector = inspect(engine)
        existing = set(inspector.get_table_names())
        if existing - set(SandboxBase.metadata.tables):
            engine.dispose()
            raise RuntimeError("Sandbox database contains non-sandbox tables; refusing to modify it")
        for name in existing:
            columns = {column["name"] for column in inspector.get_columns(name)}
            if set(SandboxBase.metadata.tables[name].columns.keys()) - columns:
                engine.dispose()
                raise RuntimeError("Sandbox schema requires an explicit versioned migration")
        SandboxBase.metadata.create_all(engine)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Cake City TEST payments — no real funds", version="1.0", lifespan=lifespan)

    @app.middleware("http")
    async def test_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-CakeCity-Simulated"] = "true"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def reviewer(authorization: str = Header(default="")) -> str:
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + settings.access_token).encode()):
            raise HTTPException(401, "Authorized sandbox reviewer required")
        return hashlib.sha256(settings.access_token.encode()).hexdigest()

    def provider():
        with sessions() as db:
            yield SimulatedPaymentProvider(db)

    @app.get("/health")
    def health():
        return {"status": "ok", "simulated": True, "schema": "sandbox-v1"}

    @app.get("/v1/test-payments/catalogue")
    def catalogue(_: str = Depends(reviewer)):
        return {"simulated": True, "currency": "KES", "products": TEST_CATALOGUE}

    @app.post("/v1/test-payments", status_code=201)
    def initiate(data: InitiatePayment, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        return service.initiate_payment(data, actor)

    @app.get("/v1/test-payments/{identity}")
    def status(identity: str, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        return service.get_transaction_status(identity, actor)

    @app.post("/v1/test-payments/{identity}/simulate")
    def simulate(identity: str, data: SimulatedCallback, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        return service.handle_webhook(identity, data, actor)

    @app.post("/v1/test-payments/{identity}/webhook")
    async def webhook(identity: str, request: Request, actor: str = Depends(reviewer),
                      service: SimulatedPaymentProvider = Depends(provider), x_sandbox_signature: str = Header(default="")):
        # Bounded body and a signature binding the path prevent cross-payment replay.
        body = await request.body()
        if len(body) > 2048:
            raise HTTPException(413, "Callback too large")
        expected = hmac.new(settings.webhook_secret.encode(), identity.encode() + b"." + body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected.encode(), x_sandbox_signature.encode()):
            raise HTTPException(401, "Invalid sandbox callback signature")
        try:
            data = SimulatedCallback.model_validate_json(body)
        except ValueError:
            raise HTTPException(422, "Invalid simulated callback") from None
        return service.handle_webhook(identity, data, actor)

    @app.post("/v1/test-payments/{identity}/refunds")
    def refund(identity: str, data: RefundPayment, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        return service.refund_payment(identity, data, actor)

    @app.get("/v1/test-payments/{identity}/receipt")
    def receipt(identity: str, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        row = service.owned(identity, actor)
        if row.status != "succeeded":
            raise HTTPException(409, "A TEST receipt requires simulated success")
        return {**service.output(row), "receipt_id": row.id + "-RECEIPT", "label": "TEST — SIMULATED PAYMENT — NOT A TAX INVOICE",
                "fiscalized": False, "funds_settled": False, "real_revenue_minor": 0}

    @app.get("/v1/test-payments/{identity}/audit")
    def audit(identity: str, actor: str = Depends(reviewer), service: SimulatedPaymentProvider = Depends(provider)):
        service.owned(identity, actor)
        return [{"kind": event.kind, "event_key": event.event_key, "at": event.at, "details": event.details, "simulated": True}
                for event in service.db.scalars(select(TestPaymentEvent).where(TestPaymentEvent.payment_id == identity).order_by(TestPaymentEvent.at))]

    return app
