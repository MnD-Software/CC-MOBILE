"""Hosted presentation orders use normal routes without contacting payment providers."""
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.commerce_models import AppOrder, SalesRecord
from app.config import get_settings
from test_pesapal import system, quote, place, start


def test_hosted_checkout_retains_prices_is_idempotent_and_never_charges(system, monkeypatch):
    s = system
    monkeypatch.setattr(get_settings(), "hosted_test_checkout_enabled", True)
    config = s["client"].get("/v1/payments/pesapal/config").json()
    assert config["available"] and config["test_checkout"]
    assert s["client"].get("/v1/app-checkout/options").json()["test_checkout"]
    q = quote(s)
    key = uuid4().hex
    first = place(s, q, key)
    assert first.status_code == 200, first.text
    order = first.json()
    assert order["total_minor"] == 250000 and order["due_now_minor"] == 0
    assert order["payment_state"] == "completed" and order["review_checkout"]
    assert place(s, q, key).json()["reference"] == order["reference"]
    assert start(s, order["reference"]).status_code == 409
    assert s["calls"] == []
    with Session(s["engine"]) as db:
        assert len(list(db.scalars(select(AppOrder)))) == 1
        assert not list(db.scalars(select(SalesRecord)))


def test_switching_to_live_requires_a_new_quote_and_keeps_old_test_orders_safe(system, monkeypatch):
    s = system
    settings = get_settings()
    assert s["client"].get("/v1/payments/pesapal/config").json()["test_checkout"] is False
    monkeypatch.setattr(settings, "hosted_test_checkout_enabled", True)
    q = quote(s)
    order = place(s).json()
    monkeypatch.setattr(settings, "hosted_test_checkout_enabled", False)
    assert place(s, q).status_code == 409
    assert start(s, order["reference"]).status_code == 409
    assert not s["calls"]


def test_live_quote_cannot_be_silently_converted_to_no_charge(system, monkeypatch):
    q = quote(system)
    monkeypatch.setattr(get_settings(), "hosted_test_checkout_enabled", True)
    assert place(system, q).status_code == 409
    assert not system["calls"]
