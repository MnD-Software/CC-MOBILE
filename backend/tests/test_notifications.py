"""Actual endpoints and durable worker; every external push call is mocked."""
import asyncio
from datetime import UTC, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_pesapal import system, start, verify
from test_logistics import delivery, actor, assign, ready, trip, progress
from app.app_commerce import record_event
from app.config import get_settings
from app.commerce_models import AppOrder
from app.notification_models import AccountNotification, PushDevice, PushJob
from app.models import Customer
from app.notifications import order_event
from app.notification_worker import drain
from app.security import create_session, rotate_refresh_token, token_hash

TOKEN = "ExpoPushToken[notifications-test-device-123]"


def test_phone_delivery_self_test_is_gated_owned_and_idempotent(system, monkeypatch):
    s = system
    monkeypatch.setattr(get_settings(), "push_enabled", False)
    assert s["client"].post("/v1/account/notifications/test").status_code == 503
    monkeypatch.setattr(get_settings(), "push_enabled", True)
    assert s["client"].post("/v1/account/notifications/test").status_code == 409
    register(s)
    for _ in range(2):
        result = s["client"].post("/v1/account/notifications/test")
        assert result.status_code == 200, result.text
        assert result.json() == {"queued": True, "delivery_confirmed": False}
    with Session(s["engine"]) as db:
        assert len(list(db.scalars(select(PushJob)))) == 1
    actor("other", "customer")
    assert s["client"].get("/v1/account/notifications").json() == []


def register(s, owner="buyer", token=TOKEN):
    actor(owner, "customer")
    with Session(s["engine"]) as db:
        session = create_session(db, db.get(Customer, owner))
    result = s["client"].post("/v1/account/notifications/devices", json={
        "token": token, "platform": "android", "provider": "expo", "refresh_token": session["refresh_token"]})
    assert result.status_code == 200, result.text
    return session


def paid(s):
    actor("buyer", "customer")
    assert start(s).status_code == 200
    assert verify(s).status_code == 200


def test_order_events_have_one_private_inbox_entry_and_transactional_push(system):
    s = system
    register(s)
    paid(s)
    assert verify(s).status_code == 200
    inbox = s["client"].get("/v1/account/notifications").json()
    assert [n["kind"] for n in inbox] == ["payment_completed"]
    assert inbox[0]["data"]["reference"] == s["reference"]
    assert "phone" not in inbox[0]["data"]
    with Session(s["engine"]) as db:
        assert len(list(db.scalars(select(PushJob)))) == 1
        order = db.scalar(select(AppOrder))
        record_event(db, order, "fulfilment_preparing")
        db.rollback()
        assert len(list(db.scalars(select(AccountNotification)))) == 1
    actor("other", "customer")
    assert s["client"].get("/v1/account/notifications").json() == []
    assert s["client"].post(f"/v1/account/notifications/{inbox[0]['id']}/read").status_code == 404
    actor("buyer", "customer")
    assert s["client"].post(f"/v1/account/notifications/{inbox[0]['id']}/read").status_code == 200
    assert s["client"].get("/v1/account/notifications").json()[0]["read_at"]


def test_simulation_and_preferences_keep_inbox_without_remote_jobs(system):
    s = system
    register(s)
    assert s["client"].patch("/v1/account/notifications/preferences", json={"order_updates": False}).status_code == 200
    paid(s)
    with Session(s["engine"]) as db:
        assert not list(db.scalars(select(PushJob)))
        order = db.scalar(select(AppOrder))
        order.channel = "app_test"
        record_event(db, order, "fulfilment_preparing")
        db.commit()
        assert not list(db.scalars(select(PushJob)))
        assert any(n.title.startswith("Test:") for n in db.scalars(select(AccountNotification)))


def test_device_requires_own_live_session_and_refresh_rotation_keeps_binding(system):
    s = system
    session = register(s)
    actor("other", "customer")
    result = s["client"].post("/v1/account/notifications/devices", json={"token": TOKEN,
        "platform": "ios", "refresh_token": session["refresh_token"]})
    assert result.status_code == 401
    with Session(s["engine"]) as db:
        rotated = rotate_refresh_token(db, session["refresh_token"])
        device = db.scalar(select(PushDevice))
        assert device.session_hash == token_hash(rotated["refresh_token"])
    assert s["client"].post("/v1/auth/mobile/logout", json={"refresh_token": rotated["refresh_token"]}).status_code == 204
    with Session(s["engine"]) as db:
        assert db.scalar(select(PushDevice)).enabled is False


def test_worker_tickets_receipts_and_dead_device_cleanup(system, monkeypatch):
    s = system
    register(s)
    paid(s)
    monkeypatch.setattr(get_settings(), "push_enabled", True)
    calls = []
    async def transport(url, body):
        calls.append((url, body))
        return {"data": {"status": "ok", "id": "ticket-1"}} if url.endswith("/send") else {"data": {"ticket-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}}
    with Session(s["engine"], expire_on_commit=False) as db:
        asyncio.run(drain(db, transport=transport))
        job = db.scalar(select(PushJob))
        assert job.state == "accepted" and job.ticket == "ticket-1"
        assert calls[0][1]["data"]["customer_id"] == "buyer"
        job.available_at = datetime.now(UTC)-timedelta(seconds=1)
        db.commit()
        asyncio.run(drain(db, transport=transport))
        db.refresh(job)
        assert job.state == "failed" and job.error == "DeviceNotRegistered"
        assert db.scalar(select(PushDevice)).enabled is False


def test_retry_backoff_disabled_worker_and_account_switch_do_not_leak(system, monkeypatch):
    s = system
    register(s)
    paid(s)
    async def unavailable(url, body):
        raise RuntimeError("offline")
    with Session(s["engine"], expire_on_commit=False) as db:
        monkeypatch.setattr(get_settings(), "push_enabled", False)
        assert asyncio.run(drain(db, transport=unavailable))["processed"] == 0
        monkeypatch.setattr(get_settings(), "push_enabled", True)
        asyncio.run(drain(db, transport=unavailable))
        job = db.scalar(select(PushJob))
        assert job.state == "pending" and job.attempts == 1
        assert job.available_at.replace(tzinfo=UTC) > datetime.now(UTC)
    register(s, "other")
    with Session(s["engine"], expire_on_commit=False) as db:
        job = db.scalar(select(PushJob))
        job.available_at = datetime.now(UTC)-timedelta(seconds=1)
        db.commit()
        async def never(url, body):
            raise AssertionError("Old account's alert must not be sent to reassigned token")
        asyncio.run(drain(db, transport=never))
        db.refresh(job)
        assert job.state == "cancelled"


def test_review_requires_completed_owned_order_and_is_idempotent(delivery):
    s = delivery
    actor("buyer", "customer")
    path = f"/v1/app-orders/{s['reference']}/review"
    assert s["client"].get(path).json() is None
    assert s["client"].post(path, json={"rating": 5}).status_code == 409
    actor()
    assign(s)
    ready(s)
    task = trip(s)
    for state in ("accepted", "collected", "in_transit", "delivered"):
        task = progress(s, task, state, **({"proof": "Received by test recipient"} if state == "delivered" else {}))
    actor("other", "customer")
    assert s["client"].post(path, json={"rating": 5}).status_code == 404
    actor("buyer", "customer")
    assert s["client"].post(path, json={"rating": 6}).status_code == 422
    assert s["client"].post(path, json={"rating": 5}).status_code == 409
    received_path = f"/v1/app-orders/{s['reference']}/received"
    assert s["client"].post(received_path).status_code == 200
    assert s["client"].post(received_path).status_code == 200
    detail = s["client"].get(f"/v1/app-orders/{s['reference']}").json()
    assert detail["received_at"]
    inbox = s["client"].get("/v1/account/notifications").json()
    assert len([n for n in inbox if n["kind"] == "satisfaction_request"]) == 1
    for _ in range(2):
        result = s["client"].post(path, json={"rating": 5, "comment": " Lovely cake "})
        assert result.status_code == 200, result.text
        assert result.json()["rating"] == 5 and result.json()["comment"] == "Lovely cake"
    assert s["client"].post(path, json={"rating": 1}).status_code == 409
    assert s["client"].get("/v1/admin/order-reviews").status_code == 403
    actor("buyer", "customer_service")
    assert s["client"].get("/v1/admin/order-reviews").json()[0]["rating"] == 5
    actor("buyer", "dispatch")
    assert s["client"].get("/v1/admin/order-reviews").status_code == 403


def test_inbox_cursor_is_owner_scoped_with_same_second_events(system):
    s = system
    paid(s)
    with Session(s["engine"]) as db:
        order = db.scalar(select(AppOrder))
        for kind in ("fulfilment_preparing", "fulfilment_ready", "fulfilment_out_for_delivery"):
            record_event(db, order, kind)
        db.commit()
    first = s["client"].get("/v1/account/notifications?limit=2").json()
    second = s["client"].get("/v1/account/notifications", params={"limit": 2, "before": first[-1]["id"]}).json()
    assert len(first) == len(second) == 2
    assert not {n["id"] for n in first} & {n["id"] for n in second}
    actor("other", "customer")
    assert s["client"].get("/v1/account/notifications", params={"before": first[-1]["id"]}).status_code == 404


def test_successful_receipt_and_queued_opt_out(system, monkeypatch):
    s = system
    register(s)
    paid(s)
    monkeypatch.setattr(get_settings(), "push_enabled", True)
    async def transport(url, body):
        return {"data": {"status": "ok", "id": "success-ticket"}} if url.endswith("/send") else {"data": {"success-ticket": {"status": "ok"}}}
    with Session(s["engine"], expire_on_commit=False) as db:
        asyncio.run(drain(db, transport=transport))
        job = db.scalar(select(PushJob))
        job.available_at = datetime.now(UTC)-timedelta(seconds=1)
        db.commit()
        asyncio.run(drain(db, transport=transport))
        db.refresh(job)
        assert job.state == "provider_ok"
        order = db.scalar(select(AppOrder))
        record_event(db, order, "fulfilment_preparing")
        db.commit()
    assert s["client"].patch("/v1/account/notifications/preferences", json={"order_updates": False}).status_code == 200
    with Session(s["engine"], expire_on_commit=False) as db:
        async def never(url, body):
            raise AssertionError("Opt-out must suppress already queued messages")
        asyncio.run(drain(db, transport=never))
        assert sorted(db.scalars(select(PushJob.state))) == ["cancelled", "provider_ok"]
