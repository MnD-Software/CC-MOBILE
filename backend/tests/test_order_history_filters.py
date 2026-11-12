from datetime import UTC, datetime
from uuid import uuid4
from sqlalchemy.orm import Session
from app.commerce_models import AppOrder
from test_pesapal import system


def seed(s):
    with Session(s["engine"]) as db:
        for reference, owner, status, payment, created, name in [
            ("APP-CHOC-OLDER", "buyer", "completed", "completed", "2026-11-11T20:59:59", "Chocolate gateau"),
            ("APP-CHOC-TODAY", "buyer", "completed", "completed", "2026-11-11T21:00:00", "Chocolate gateau"),
            ("APP-VANILLA", "buyer", "completed", "completed", "2026-11-12T10:00:00", "Vanilla cake"),
            ("APP-ACTIVE", "buyer", "preparing", "completed", "2026-11-12T10:00:00", "Chocolate gateau"),
            ("APP-CANCELLED", "buyer", "cancelled", "cancelled", "2026-11-12T10:00:00", "Cupcakes"),
            ("APP-OTHER", "other", "completed", "completed", "2026-11-12T10:00:00", "Chocolate gateau"),
        ]:
            db.add(AppOrder(reference=reference, customer_id=owner, request_key=uuid4().hex,
                request_digest="test", account_id="primary", account_fingerprint="test", environment="live",
                state=status, payment_state=payment, snapshot={"lines":[{"product_id":12,"slug":"cake","name":name,
                    "quantity":2,"selection":{"size":"1kg","message":"chocolate"}}], "billing":{"email":"private@example.com"}},
                subtotal_minor=50000,total_minor=50000,discount_minor=0,delivery_minor=0,
                created_at=datetime.fromisoformat(created).replace(tzinfo=UTC)))
        db.commit()


def test_active_and_past_tabs_are_owner_scoped_and_include_product_summaries(system):
    seed(system)
    result = system["client"].get("/v1/app-orders?scope=active")
    assert result.status_code == 200
    assert [r["reference"] for r in result.json()["data"]] == ["APP-ACTIVE"]
    assert result.json()["data"][0]["items"][0] == {"product_id":12,"slug":"cake","name":"Chocolate gateau","quantity":2,"size":"1kg"}
    assert "private@example.com" not in result.text
    past = system["client"].get("/v1/app-orders?scope=past").json()["data"]
    assert {r["reference"] for r in past} == {"APP-CHOC-OLDER", "APP-CHOC-TODAY", "APP-VANILLA", "APP-CANCELLED"}


def test_date_and_cake_filters_use_kenyan_calendar_days_and_paginate_the_matches(system):
    seed(system)
    client=system["client"]
    result=client.get("/v1/app-orders?scope=past&from_date=2026-11-12&to_date=2026-11-12&cake=chocolate").json()
    assert [r["reference"] for r in result["data"]] == ["APP-CHOC-TODAY"]
    first=client.get("/v1/app-orders?scope=past&cake=chocolate&limit=1").json()
    assert first["data"][0]["reference"] == "APP-CHOC-TODAY"
    assert first["next_cursor"]
    second=client.get(f"/v1/app-orders?scope=past&cake=chocolate&limit=1&before={first['next_cursor']}").json()
    assert second["data"][0]["reference"] == "APP-CHOC-OLDER"
    assert second["next_cursor"] is None
    assert client.get("/v1/app-orders?from_date=2026-11-13&to_date=2026-11-12").status_code == 422
    assert client.get("/v1/app-orders?scope=invalid").status_code == 422
