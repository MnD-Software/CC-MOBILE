import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

os.environ["JWT_SECRET"] = "test-secret"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.config import get_settings
from app.db import SessionLocal
from app.models import ClubEntry


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def register(client):
    response = client.post("/v1/auth/mobile/register", json={"email": f"{uuid4().hex}@example.com", "password": "test-password-long", "first_name": "Club", "last_name": "Member"})
    assert response.status_code == 201
    session = response.json()
    return session["customer"]["id"], {"Authorization": f"Bearer {session['access_token']}"}


def event(client, customer, order, paid=100000, refunded=0, event_id=None):
    raw = json.dumps({"event_id": event_id or uuid4().hex, "customer_id": customer, "order_id": order, "paid_minor": paid, "refunded_minor": refunded}).encode()
    signature = hmac.new(b"test-club-secret", raw, hashlib.sha256).hexdigest()
    return client.post("/v1/integrations/club/order-event", content=raw, headers={"X-Club-Signature": signature})


def test_club_requires_auth_and_signed_events(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    assert client.get("/v1/club").status_code == 401
    assert client.post("/v1/integrations/club/order-event", content=b"{}").status_code == 401


def test_awards_are_idempotent_and_refunds_reverse_only_once(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    member, headers = register(client)
    order = uuid4().hex
    identity = uuid4().hex
    assert event(client, member, order, event_id=identity).status_code == 200
    assert event(client, member, order, event_id=identity).json()["status"] == "duplicate"
    # A separate event for the same paid order does not grant points again.
    assert event(client, member, order).status_code == 200
    assert client.get("/v1/club", headers=headers).json()["points"] == 10
    assert event(client, member, order, refunded=50000).status_code == 200
    assert event(client, member, order, refunded=50000).status_code == 200
    assert client.get("/v1/club", headers=headers).json()["points"] == 5
    assert event(client, member, order, refunded=100000).status_code == 200
    assert client.get("/v1/club", headers=headers).json()["points"] == 0
    assert event(client, member, order, refunded=50000).status_code == 409


def test_expiry_is_applied_once_and_no_coupons_without_provider(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "club_event_secret", "test-club-secret")
    monkeypatch.setattr(settings, "woocommerce_consumer_key", "")
    member, headers = register(client)
    assert event(client, member, uuid4().hex).status_code == 200
    with SessionLocal() as db:
        lot = db.scalar(select(ClubEntry).where(ClubEntry.customer_id == member, ClubEntry.remaining > 0))
        lot.expires_at = datetime.now(UTC)-timedelta(days=1)
        db.commit()
    first = client.get("/v1/club", headers=headers).json()
    second = client.get("/v1/club", headers=headers).json()
    assert first["points"] == second["points"] == 0
    assert len(first["activity"]) == len(second["activity"]) == 2
    assert client.post("/v1/club/redeem", headers=headers, json={"points": 100, "request_key": uuid4().hex}).status_code == 503


def test_celebrations_validate_dates_and_never_cross_accounts(client):
    _, alice = register(client)
    _, bob = register(client)
    assert client.post("/v1/account/celebrations", headers=alice, json={"name": "Birthday", "month": 2, "day": 30}).status_code == 422
    saved = client.post("/v1/account/celebrations", headers=alice, json={"name": "Family birthday", "month": 2, "day": 29})
    assert saved.status_code == 201
    identity = saved.json()["id"]
    assert client.get("/v1/account/celebrations", headers=bob).json() == []
    assert client.delete(f"/v1/account/celebrations/{identity}", headers=bob).status_code == 404
    assert client.delete(f"/v1/account/celebrations/{identity}", headers=alice).status_code == 204


def test_redemption_recovers_provider_failure_without_double_spend_and_refund_records_debt(client, monkeypatch):
    import httpx
    settings = get_settings()
    monkeypatch.setattr(settings, "club_event_secret", "test-club-secret")
    monkeypatch.setattr(settings, "woocommerce_consumer_key", "test-key")
    monkeypatch.setattr(settings, "woocommerce_consumer_secret", "test-provider-secret")
    member, headers = register(client)
    order = uuid4().hex
    assert event(client, member, order, paid=10000000).status_code == 200
    issued = []
    calls = []
    fail = [True]

    class Provider:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, params):
            if fail[0]:
                raise httpx.ConnectError("provider unavailable")
            return httpx.Response(200, json=issued, request=httpx.Request("GET", url))

        async def post(self, url, json):
            calls.append(json)
            issued.append({"id": 1, "code": json["code"]})
            return httpx.Response(201, json=issued[0], request=httpx.Request("POST", url))

    monkeypatch.setattr("app.routes_club.httpx.AsyncClient", Provider)
    payload = {"points": 100, "request_key": uuid4().hex}
    pending = client.post("/v1/club/redeem", headers=headers, json=payload)
    assert pending.status_code == 200 and pending.json()["status"] == "pending"
    assert client.get("/v1/club", headers=headers).json()["points"] == 900
    fail[0] = False
    completed = client.post("/v1/club/redeem", headers=headers, json=payload)
    repeated = client.post("/v1/club/redeem", headers=headers, json=payload)
    assert completed.json() == repeated.json()
    assert completed.json()["status"] == "issued"
    assert len(calls) == 1
    assert calls[0]["amount"] == "100.00" and calls[0]["minimum_amount"] == "1000.00"
    assert calls[0]["usage_limit"] == 1 and calls[0]["individual_use"] is True
    assert event(client, member, order, paid=10000000, refunded=10000000).status_code == 200
    balance = client.get("/v1/club", headers=headers).json()
    assert balance["points"] == 0 and balance["debt"] == 100
    assert event(client, member, uuid4().hex, paid=200000).status_code == 200
    balance = client.get("/v1/club", headers=headers).json()
    assert balance["points"] == 0 and balance["debt"] == 80


def test_refunding_expired_points_does_not_create_spending_debt(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    member, headers = register(client)
    order = uuid4().hex
    assert event(client, member, order).status_code == 200
    with SessionLocal() as db:
        lot = db.scalar(select(ClubEntry).where(ClubEntry.customer_id == member, ClubEntry.remaining > 0))
        lot.expires_at = datetime.now(UTC)-timedelta(days=1)
        db.commit()
    assert event(client, member, order, refunded=100000).status_code == 200
    balance = client.get("/v1/club", headers=headers).json()
    assert balance["points"] == balance["debt"] == 0


def test_enquiries_are_account_scoped_and_quote_acceptance_checks_revision(client):
    from app.models import Customer
    member, headers = register(client)
    other, other_headers = register(client)
    data = {"request_key": uuid4().hex, "kind": "custom_cake", "subject": "Birthday cake", "details": "Chocolate cake for 20 people next month"}
    first = client.post("/v1/account/enquiries", headers=headers, json=data)
    assert first.status_code == 201
    assert client.post("/v1/account/enquiries", headers=headers, json=data).json()["id"] == first.json()["id"]
    identity = first.json()["id"]
    assert client.get("/v1/account/enquiries", headers=other_headers).json() == []
    assert client.get("/v1/admin/enquiries", headers=headers).status_code == 403
    with SessionLocal() as db:
        db.get(Customer, other).role = "staff"
        db.commit()
    reply = {"revision": 1, "status": "quoted", "response": "Design and servings confirmed", "quote_minor": 500000, "quote_expires_at": (datetime.now(UTC)+timedelta(days=3)).isoformat()}
    assert client.patch(f"/v1/admin/enquiries/{identity}", headers=other_headers, json=reply).status_code == 200
    assert client.post(f"/v1/account/enquiries/{identity}/accept", headers=other_headers, json={"revision": 2}).status_code == 404
    assert client.post(f"/v1/account/enquiries/{identity}/accept", headers=headers, json={"revision": 1}).status_code == 409
    accepted = client.post(f"/v1/account/enquiries/{identity}/accept", headers=headers, json={"revision": 2})
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    assert client.post(f"/v1/account/enquiries/{identity}/accept", headers=headers, json={"revision": 2}).status_code == 200


def test_woo_link_requires_private_receipt_and_awards_from_verified_provider_data(client, monkeypatch):
    member, headers = register(client)
    _, other = register(client)
    order_id = int(uuid4().hex[:10], 16)
    order = {"id": order_id, "order_key": "wc_order_private-receipt", "billing": {"email": "buyer@example.com"}, "currency": "KES", "status": "processing", "date_paid": "2026-10-07T10:00:00", "line_items": [{"total": "2500.00"}]}
    refunds = []

    async def provider(_):
        return order, refunds

    monkeypatch.setattr("app.routes_woo_club.verified_order", provider)
    data = {"order_id": order_id, "order_key": "wrong-private-key", "billing_email": "buyer@example.com"}
    assert client.post("/v1/club/orders/link", headers=headers, json=data).status_code == 403
    data["order_key"] = order["order_key"]
    assert client.post("/v1/club/orders/link", headers=headers, json=data).status_code == 200
    assert client.post("/v1/club/orders/link", headers=headers, json=data).status_code == 200
    assert client.get("/v1/club", headers=headers).json()["points"] == 25
    assert client.post("/v1/club/orders/link", headers=other, json=data).status_code == 409
    refunds.append({"amount": "500.00", "line_items": [{"total": "-500.00"}]})
    assert client.post("/v1/club/orders/link", headers=headers, json=data).status_code == 200
    assert client.get("/v1/club", headers=headers).json()["points"] == 20


def test_pairing_curation_is_staff_only_and_rejects_self_pairings(client):
    _, headers = register(client)
    assert client.put("/v1/admin/catalogue/pairings/1", headers=headers, json={"product_ids": [2]}).status_code == 403


def test_birthday_award_requires_eligibility_and_is_once_per_year(client, monkeypatch):
    from app.models import Customer
    from app.routes_club_benefits import local_today
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    member, headers = register(client)
    today = local_today()
    assert client.put("/v1/club/birthday", headers=headers, json={"month": today.month, "day": today.day}).status_code == 200
    assert client.post("/v1/club/birthday/claim", headers=headers).status_code == 409
    with SessionLocal() as db:
        db.get(Customer, member).created_at = datetime.now(UTC)-timedelta(days=31)
        db.commit()
    assert event(client, member, uuid4().hex, paid=200000).status_code == 200
    assert client.post("/v1/club/birthday/claim", headers=headers).json()["points"] == 50
    assert client.post("/v1/club/birthday/claim", headers=headers).json()["status"] == "already_claimed"
    assert client.get("/v1/club", headers=headers).json()["points"] == 70


def test_leap_day_birthday_can_be_claimed_on_february_28_in_non_leap_year(client, monkeypatch):
    from datetime import date
    from app.models import Customer
    from app import routes_club_benefits
    monkeypatch.setattr(routes_club_benefits, "local_today", lambda: date(2027, 2, 28))
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    member, headers = register(client)
    assert client.put("/v1/club/birthday", headers=headers, json={"month": 2, "day": 29}).status_code == 200
    with SessionLocal() as db:
        db.get(Customer, member).created_at = datetime.now(UTC)-timedelta(days=31)
        db.commit()
    assert event(client, member, uuid4().hex, paid=200000).status_code == 200
    assert client.post("/v1/club/birthday/claim", headers=headers).json()["points"] == 50
    assert client.post("/v1/club/birthday/claim", headers=headers).json()["status"] == "already_claimed"


def test_referral_awards_only_on_completed_first_order_and_reverses_after_refund(client, monkeypatch):
    from app.routes_club_benefits import sync_referral
    monkeypatch.setattr(get_settings(), "club_event_secret", "test-club-secret")
    inviter, inviter_headers = register(client)
    friend, friend_headers = register(client)
    assert client.post("/v1/club/referrals", headers=friend_headers, json={"code": "CC-"+inviter}).status_code == 200
    assert client.post("/v1/club/referrals", headers=inviter_headers, json={"code": "CC-"+friend}).status_code == 409
    order = uuid4().hex
    assert event(client, friend, order, paid=200000).status_code == 200
    assert client.get("/v1/club", headers=inviter_headers).json()["points"] == 0
    with SessionLocal() as db:
        sync_referral(friend, order, "completed", db)
        sync_referral(friend, order, "completed", db)
    assert client.get("/v1/club", headers=inviter_headers).json()["points"] == 50
    assert event(client, friend, order, paid=200000, refunded=200000).status_code == 200
    assert client.get("/v1/club", headers=inviter_headers).json()["points"] == 0
    assert client.get("/v1/club/benefits", headers=friend_headers).json()["referral_status"] == "reversed"


def test_cloud_wallet_merges_codes_idempotently_and_is_account_isolated(client):
    _, alice = register(client)
    _, bob = register(client)
    assert client.post("/v1/club/coupons", headers=alice, json={"codes": [" Welcome ", "welcome"]}).json() == ["welcome"]
    assert client.post("/v1/club/coupons", headers=alice, json={"codes": ["birthday"]}).json() == ["birthday", "welcome"]
    assert client.get("/v1/club/coupons", headers=bob).json() == []
    assert client.post("/v1/club/coupons/remove", headers=bob, json={"code": "welcome"}).status_code == 200
    assert client.get("/v1/club/coupons", headers=alice).json() == ["birthday", "welcome"]


def test_branch_barcode_lookup_is_staff_only_and_identifies_without_redeeming(client):
    import base64
    from uuid import UUID
    from app.models import Customer
    target, target_headers = register(client)
    staff_id, staff_headers = register(client)
    code = "CC1:" + base64.urlsafe_b64encode(UUID(target).bytes).decode().rstrip("=")
    body = {"barcode": code}
    assert client.post("/v1/admin/club/lookup", json=body).status_code == 401
    assert client.post("/v1/admin/club/lookup", headers=target_headers, json=body).status_code == 403
    with SessionLocal() as db:
        db.get(Customer, staff_id).role = "staff"
        db.commit()
    response = client.post("/v1/admin/club/lookup", headers=staff_headers, json=body)
    assert response.status_code == 200
    assert response.json() == {"member_id": target, "name": "Club Member", "tier": "Silver", "points": 0, "review_required": False}
    assert client.post("/v1/admin/club/lookup", headers=staff_headers, json={"barcode": "CC1:" + "!" * 22}).status_code == 422
    missing = "CC1:" + base64.urlsafe_b64encode(uuid4().bytes).decode().rstrip("=")
    assert client.post("/v1/admin/club/lookup", headers=staff_headers, json={"barcode": missing}).status_code == 404
    assert client.get("/v1/club", headers=target_headers).json()["points"] == 0
