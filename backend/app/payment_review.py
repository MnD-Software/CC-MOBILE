"""Paired local phone review of the isolated simulator; never a commerce router."""
import base64
import hashlib
import hmac
import json
from collections import OrderedDict
from threading import Lock
from time import time
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from sqlalchemy import func, select

from .payment_sandbox import (
    InitiatePayment, SimulatedCallback, SimulatedPaymentProvider, StrictInput,
    TEST_CATALOGUE, TestBilling, TestLine, TestPayment, TestPaymentEvent, test_membership,
)


class Pair(StrictInput):
    code: str = Field(pattern=r"^[0-9]{8}$")


class Purchase(StrictInput):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    billing: TestBilling


class Complete(StrictInput):
    outcome: str = Field(pattern=r"^(succeeded|failed|timed_out|cancelled)$")


def mount_mobile_review(app, settings, sessions):
    origins = [value.strip() for value in settings.mobile_origins.split(",") if value.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                       allow_headers=["Authorization", "Content-Type"], expose_headers=["X-CakeCity-Simulated"])
    attempts = OrderedDict()
    pairing_lock = Lock()

    def signature(payload):
        return hmac.new(settings.webhook_secret.encode(), b"mobile-test-session-v1." + payload.encode(),
                        hashlib.sha256).hexdigest()

    def new_session():
        expires = int(time()) + 86400
        payload = base64.urlsafe_b64encode(json.dumps({"actor": uuid4().hex, "exp": expires}).encode()).decode().rstrip("=")
        return {"simulated": True, "token": "test." + payload + "." + signature(payload), "expires_at": expires}

    def member(authorization: str = Header(default="")):
        try:
            if not authorization.startswith("Bearer test.") or len(authorization) > 512:
                raise ValueError()
            _, payload, digest = authorization[7:].split(".")
            if not hmac.compare_digest(signature(payload), digest):
                raise ValueError()
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            if claims["exp"] < time() or len(claims["actor"]) != 32:
                raise ValueError()
            return "mobile:" + claims["actor"]
        except (ValueError, KeyError, TypeError):
            raise HTTPException(401, "Connect with the local test code again") from None

    def provider():
        with sessions() as db:
            yield SimulatedPaymentProvider(db)

    @app.post("/v1/test-checkout/session")
    def pair(data: Pair, request: Request):
        # Bound both guessing attempts and the limiter's memory. The eight-digit
        # code is generated locally and is never embedded in an Expo bundle.
        host = request.client.host if request.client else "unknown"
        window = int(time()) // 300
        with pairing_lock:
            count, old_window = attempts.pop(host, (0, window))
            count = count + 1 if old_window == window else 1
            attempts[host] = (count, window)
            if len(attempts) > 256:
                attempts.popitem(last=False)
        if count > 10:
            raise HTTPException(429, "Too many test-code attempts. Try again in five minutes.")
        if not hmac.compare_digest(data.code, settings.mobile_pairing_code):
            raise HTTPException(401, "That test code does not match this computer")
        return new_session()

    @app.post("/v1/test-checkout/new-run")
    def restart(_: str = Depends(member)):
        # Retain old test records. Starting over changes only the test identity.
        return new_session()

    @app.get("/v1/test-checkout/state")
    def state(actor: str = Depends(member), service=Depends(provider)):
        rows = service.db.scalars(select(TestPayment).where(TestPayment.actor == actor)
                                 .order_by(TestPayment.created_at.desc(), TestPayment.id.desc()).limit(100)).all()
        return {"simulated": True, "membership": test_membership(service.db, actor),
                "product": {"sku": "TEST-REWARD-CAKE", **TEST_CATALOGUE["TEST-REWARD-CAKE"]},
                "history": [service.output(row) for row in rows]}

    @app.post("/v1/test-checkout/purchases", status_code=201)
    def purchase(data: Purchase, actor: str = Depends(member), service=Depends(provider)):
        old = service.db.scalar(select(TestPayment).where(TestPayment.actor == actor, TestPayment.request_key == data.request_key))
        count = service.db.scalar(select(func.count()).select_from(TestPayment).where(TestPayment.actor == actor))
        if not old and count >= 100:
            raise HTTPException(409, "Start a fresh test to make more test purchases")
        return service.initiate_payment(InitiatePayment(request_key=data.request_key, billing=data.billing,
                                                        lines=[TestLine(sku="TEST-REWARD-CAKE", quantity=1)]), actor)

    @app.post("/v1/test-checkout/purchases/{identity}/complete")
    def complete(identity: str, data: Complete, actor: str = Depends(member), service=Depends(provider)):
        row = service.owned(identity, actor)
        return service.handle_webhook(identity, SimulatedCallback(event_key="mobile-complete-" + row.id,
            status=data.outcome, amount_minor=row.amount_minor, currency="KES"), actor)

    @app.get("/v1/test-checkout/purchases/{identity}/receipt")
    def receipt(identity: str, actor: str = Depends(member), service=Depends(provider)):
        row = service.owned(identity, actor)
        event = service.db.scalar(select(TestPaymentEvent).where(TestPaymentEvent.payment_id == row.id,
                                                                TestPaymentEvent.kind == "test_receipt"))
        if not event:
            raise HTTPException(409, "A receipt is created only after simulated payment succeeds")
        # Preserve the original sale snapshot and expose later refunds separately.
        return {**event.details, "current_refunded_minor": row.refunded_minor}
