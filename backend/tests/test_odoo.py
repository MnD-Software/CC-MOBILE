"""Real app endpoints/database with mocked Odoo; no ERP or provider side effects."""
import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import time
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_pesapal import system, start, verify
from app.config import get_settings
from app.commerce_models import AppCoupon, AppProduct
from app.main import app
from app.models import ClubEntry, Customer
from app.odoo_client import OdooClient, connection_settings
from app.odoo_models import OdooBinding, OdooCursor, OdooOutbox
from app.odoo_sync import Change, apply_change, drain, enqueue
from app.routes_club import member


@pytest.fixture
def connected(system, monkeypatch):
    s = get_settings()
    for name, value in {"odoo_enabled": True, "odoo_url": "https://erp.example.test", "odoo_database": "test-db",
        "odoo_api_key": "private-test-key", "odoo_company_id": 3, "odoo_source_id": "test-odoo",
        "odoo_webhook_secret": "a"*48, "odoo_loyalty_authority": False,
        "odoo_require_mapped_products": False}.items():
        monkeypatch.setattr(s, name, value)
    return system


def administrator():
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="admin")


def change(resource="products", record_id="template:42", version=1, **payload):
    product = {"name": "Odoo cake", "type": "variable", "price_minor": 260000,
               "currency": "KES", "enabled": True}
    return Change(event_id=f"event-{record_id}-{version}", resource=resource, record_id=record_id,
                  version=version, payload={**product, **payload} if resource == "products" else payload)


def post_change(s, value, timestamp=None, signature=None):
    raw = value.model_dump_json().encode()
    timestamp = str(timestamp or int(time.time()))
    signature = signature or hmac.new(get_settings().odoo_webhook_secret.encode(), timestamp.encode()+b"."+raw, hashlib.sha256).hexdigest()
    return s["client"].post("/v1/integrations/odoo/events", content=raw,
        headers={"Content-Type": "application/json", "X-Odoo-Timestamp": timestamp, "X-Odoo-Signature": signature})


def test_products_variations_stable_mapping_and_duplicate_delivery(connected):
    s = connected
    parent = change()
    assert post_change(s, parent).status_code == 200
    assert post_change(s, parent).json()["status"] == "duplicate"
    variant = change(record_id="variant:7", version=2, name="1.5kg Odoo cake", type="variation", parent_id="template:42",
        variation_attributes=[{"name": "Size", "value": "1.5 kg"}])
    assert post_change(s, variant).status_code == 200
    with Session(s["engine"]) as db:
        links = list(db.scalars(select(OdooBinding).order_by(OdooBinding.id)))
        parent_row, child = [db.get(AppProduct, int(item.local_id)) for item in links]
        assert child.parent_id == parent_row.id
        assert parent_row.payload["variations"][0]["id"] == child.id
        assert db.get(AppProduct, 12).price_minor == 250000  # original catalogue preserved
    assert post_change(s, change(version=3, price_minor=280000)).status_code == 200
    assert post_change(s, change(version=2)).status_code == 409


def test_same_event_or_version_cannot_change_content(connected):
    assert post_change(connected, change()).status_code == 200
    assert post_change(connected, change(name="Conflicting name")).status_code == 409
    same_version = change(name="Different data").model_copy(update={"event_id": "another-event"})
    assert post_change(connected, same_version).status_code == 409


def test_disable_preserves_product_order_identity(connected):
    assert post_change(connected, change()).status_code == 200
    disabled = change(version=2).model_copy(update={"deleted": True, "payload": {}})
    assert post_change(connected, disabled).status_code == 200
    with Session(connected["engine"]) as db:
        link = db.scalar(select(OdooBinding))
        assert db.get(AppProduct, int(link.local_id)).enabled is False


@pytest.mark.parametrize("overrides", [{"currency": "USD"}, {"price_minor": 0}, {"type": "variation", "parent_id": "missing"}])
def test_invalid_product_import_rolls_back(connected, overrides):
    assert post_change(connected, change(**overrides)).status_code in (409, 422)
    with Session(connected["engine"]) as db:
        assert not list(db.scalars(select(OdooBinding)))


def test_signed_events_reject_tampering_and_old_timestamps(connected):
    assert post_change(connected, change(), signature="bad").status_code == 401
    assert post_change(connected, change(), timestamp=int(time.time())-600).status_code == 401


def test_regular_customer_cannot_manage_or_discover_erp(connected):
    for path in ("status", "schema/customers", "records/riders"):
        assert connected["client"].get("/v1/admin/odoo/" + path).status_code == 403
    administrator()
    body = connected["client"].get("/v1/admin/odoo/status").json()
    assert body["connection_configured"] is True
    assert "private-test-key" not in json.dumps(body)
    assert connected["client"].get("/v1/admin/odoo/schema/ir.config_parameter").status_code == 404


def test_account_sync_commits_atomically_and_omits_password_and_role(connected):
    with Session(connected["engine"]) as db:
        customer = db.get(Customer, "buyer")
        customer.first_name = "Updated"
        db.flush()
        db.rollback()
    with Session(connected["engine"]) as db:
        assert not list(db.scalars(select(OdooOutbox)))
        customer = db.get(Customer, "buyer")
        customer.first_name = "Updated"
        db.commit()
        event = db.scalar(select(OdooOutbox))
        assert event.kind == "customer.changed"
        assert "password_hash" not in event.payload["data"]
        assert "role" not in event.payload["data"]


def test_verified_payment_queues_original_reference_once(connected):
    assert start(connected).status_code == 200
    assert verify(connected).status_code == 200
    assert verify(connected).status_code == 200
    with Session(connected["engine"]) as db:
        events = list(db.scalars(select(OdooOutbox).where(OdooOutbox.kind == "order.payment_completed")))
        assert len(events) == 1
        data = events[0].payload["data"]
        assert data["reference"] == connected["reference"]
        assert data["payment_state"] == "completed" and data["tracking_id"] == connected["tracking"]
        assert "payment_url" not in data


def test_uncertain_delivery_retries_exact_event_and_holds_later_events(connected, monkeypatch):
    calls = []
    async def send(self, method, **kwargs):
        calls.append(kwargs["event"])
        if len(calls) == 1:
            raise HTTPException(502, "Ambiguous Odoo timeout")
        return {"event_id": kwargs["event"]["event_id"], "status": "duplicate"}
    monkeypatch.setattr(OdooClient, "bridge", send)
    with Session(connected["engine"]) as db:
        enqueue(db, "customer.changed", "buyer", {"id": "buyer"}, key="one")
        enqueue(db, "customer.changed", "buyer", {"id": "buyer", "first_name": "Next"}, key="two")
        db.commit()
        assert asyncio.run(drain(db))["retry"] == 1
        assert len(calls) == 1
        for row in db.scalars(select(OdooOutbox)):
            row.available_at = datetime.now(UTC)-timedelta(seconds=1)
        db.commit()
        assert asyncio.run(drain(db))["delivered"] == 2
        assert calls[0] == calls[1]
        assert calls[2]["event_id"] != calls[1]["event_id"]


def test_pull_feed_updates_cursor_only_after_valid_projection(connected, monkeypatch):
    administrator()
    async def feed(self, method, **kwargs):
        return {"data": [change().model_dump()], "next_cursor": 1, "has_more": False}
    monkeypatch.setattr(OdooClient, "bridge", feed)
    response = connected["client"].post("/v1/admin/odoo/pull", json={"limit": 50})
    assert response.status_code == 200, response.text
    assert response.json()["cursor"] == 1
    async def broken(self, method, **kwargs):
        return {"data": [change(version=2, price_minor=0).model_dump()], "next_cursor": 2}
    monkeypatch.setattr(OdooClient, "bridge", broken)
    assert connected["client"].post("/v1/admin/odoo/pull", json={}).status_code == 422
    with Session(connected["engine"]) as db:
        assert db.get(OdooCursor, "test-odoo").cursor == 1


def test_odoo_member_balance_and_redemption_do_not_use_local_ledger(connected, monkeypatch):
    monkeypatch.setattr(get_settings(), "odoo_loyalty_authority", True)
    calls = []
    async def remote(self, method, **kwargs):
        calls.append((method, kwargs))
        if method == "club_overview":
            return {"member_id": kwargs["customer_id"], "points": 432}
        if method == "club_redeem":
            return {"id": "reward-1", "customer_id": "buyer", "request_key": kwargs["request_key"], "points": kwargs["points"],
                "code": "odoo-app-test", "amount_minor": 10000, "minimum_minor": 100000,
                "expires_at": (datetime.now(UTC)+timedelta(days=90)).isoformat(), "status": "issued"}
    monkeypatch.setattr(OdooClient, "bridge", remote)
    assert connected["client"].get("/v1/club").json()["points"] == 432
    request = {"points": 100, "request_key": "same-odoo-reward-key"}
    for _ in range(2):
        response = connected["client"].post("/v1/club/redeem", json=request)
        assert response.status_code == 200, response.text
    with Session(connected["engine"]) as db:
        assert len(list(db.scalars(select(AppCoupon)))) == 1
        assert not list(db.scalars(select(ClubEntry)))
    assert all(arguments["customer_id"] == "buyer" for _, arguments in calls)


def test_odoo_loyalty_outage_never_falls_back_or_awards_local_points(connected, monkeypatch):
    monkeypatch.setattr(get_settings(), "odoo_loyalty_authority", True)
    async def unavailable(*args, **kwargs):
        raise HTTPException(502, "Odoo unavailable")
    monkeypatch.setattr(OdooClient, "bridge", unavailable)
    assert connected["client"].get("/v1/club").status_code == 502
    assert start(connected).status_code == 200
    assert verify(connected).status_code == 200
    with Session(connected["engine"]) as db:
        assert not list(db.scalars(select(ClubEntry)))


def test_transport_uses_json2_private_key_and_forces_company(connected, monkeypatch):
    requests = []
    async def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"contract": "cakecity-odoo-v1"})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    result = asyncio.run(OdooClient().call("res.partner", "search_read", context={"allowed_company_ids": [99]}))
    assert result["contract"] == "cakecity-odoo-v1"
    request = requests[0]
    assert str(request.url) == "https://erp.example.test/json/2/res.partner/search_read"
    assert request.headers["Authorization"] == "bearer private-test-key"
    assert request.headers["X-Odoo-Database"] == "test-db"
    assert json.loads(request.content)["context"]["allowed_company_ids"] == [3]


@pytest.mark.parametrize("url", ["http://erp.example.test", "https://user:password@erp.example.test", "https://erp.example.test/odoo"])
def test_transport_rejects_unsafe_or_ui_origins_before_network(connected, monkeypatch, url):
    monkeypatch.setattr(get_settings(), "odoo_url", url)
    with pytest.raises(HTTPException) as problem:
        connection_settings()
    assert problem.value.status_code == 503


def test_full_odoo_mode_blocks_unmapped_products(connected, monkeypatch):
    monkeypatch.setattr(get_settings(), "odoo_require_mapped_products", True)
    response = connected["client"].post("/v1/app-checkout/quote", json=connected["payload"])
    assert response.status_code == 409
    assert "mapped to Odoo" in response.json()["detail"]


def test_odoo_product_edits_and_stale_checkout_are_blocked(connected):
    assert post_change(connected, change()).status_code == 200
    administrator()
    with Session(connected["engine"]) as db:
        identity = int(db.scalar(select(OdooBinding.local_id)))
    response = connected["client"].put(f"/v1/admin/app-products/{identity}", json={
        "revision": 1, "allocation": 0, "price_minor": 1, "enabled": True})
    assert response.status_code == 409
    with Session(connected["engine"]) as db:
        product = db.get(AppProduct, 12)
        product.payload = {**product.payload, "odoo_source": "test-odoo"}
        db.commit()
    response = connected["client"].post("/v1/app-checkout/quote", json=connected["payload"])
    assert response.status_code == 503
    with Session(connected["engine"]) as db:
        db.add(OdooCursor(source="test-odoo", cursor=1, last_success=datetime.now(UTC)))
        db.commit()
    assert connected["client"].post("/v1/app-checkout/quote", json=connected["payload"]).status_code == 200


def test_odoo_delivery_cannot_mark_an_unpaid_order_paid(connected):
    from test_pesapal import place
    order = place(connected).json()
    value = change(resource="deliveries", record_id="delivery:1", reference=order["reference"], status="completed")
    assert post_change(connected, value).status_code == 409


def test_rider_and_fulfilment_updates_reach_customer_tracking(connected):
    connected["payload"]["fulfilment"] = "delivery"
    connected["payload"]["delivery_zone_id"] = "zone"
    connected["amount"] = 2800
    assert start(connected).status_code == 200
    assert verify(connected).status_code == 200
    assert post_change(connected, change(resource="riders", record_id="rider:1", name="Odoo Rider", phone="0712345678", active=True)).status_code == 200
    delivery = change(resource="deliveries", record_id="delivery:1", reference=connected["reference"],
        status="out_for_delivery", rider_id="rider:1")
    assert post_change(connected, delivery).status_code == 200
    response = connected["client"].get("/v1/app-orders/" + connected["reference"])
    assert response.json()["status"] == "out_for_delivery"
    assert response.json()["dispatch"]["rider_name"] == "Odoo Rider"
    stale = delivery.model_copy(update={"version": 2, "event_id": "delivery-regression",
        "payload": {**delivery.payload, "status": "preparing"}})
    assert post_change(connected, stale).status_code == 409
