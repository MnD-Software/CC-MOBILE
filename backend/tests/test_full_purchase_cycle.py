"""No provider or hosted database calls: owner-authorized simulation through actual order APIs."""
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4
import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from test_pesapal import system
from app.config import get_settings
from app.main import app
from app.models import Customer, ClubAccount, ClubEntry, ClubOrder
from app.commerce_models import AppOrder, AppPolicy, SalesRecord
from app.routes_club import member


def role(s, name, identity="buyer"):
    with Session(s["engine"]) as db:
        db.get(Customer, identity).role = name
        db.commit()
    app.dependency_overrides[member] = lambda: SimpleNamespace(id=identity, role=name)


def create(s, fulfilment="delivery"):
    client = s["client"]
    product = client.post("/v1/admin/payment-test/product", json={})
    assert product.status_code == 200, product.text
    data = deepcopy(s["payload"])
    data["items"] = [{"product_id": product.json()["id"], "quantity": 1}]
    data["fulfilment"] = fulfilment
    quote = client.post("/v1/app-checkout/quote", json=data)
    assert quote.status_code == 200, quote.text
    assert {k: quote.json()[k] for k in ("total_minor", "tax_minor", "delivery_minor")} == {"total_minor":100,"tax_minor":0,"delivery_minor":0}
    result = client.post("/v1/app-orders", json={"quote_id":quote.json()["id"]}, headers={"Idempotency-Key":uuid4().hex})
    assert result.status_code == 200, result.text
    return result.json(), data


def test_full_simulated_order_club_kitchen_dispatch_tracking_without_pesapal(system, monkeypatch):
    s = system
    role(s, "admin")
    monkeypatch.setattr(get_settings(), "pesapal_consumer_key", "")
    monkeypatch.setattr(get_settings(), "pesapal_consumer_secret", "")
    # Even a disabled checkout and exclusive tax must not require a provider for the staff test.
    with Session(s["engine"]) as db:
        db.get(AppPolicy, "checkout").payload = {"enabled":False,"tax_bps":1600,"prices_include_tax":False}
        db.commit()
    order, _ = create(s)
    reference = order["reference"]
    assert reference.startswith("APP-TEST-") and order["payment_test"]
    assert order["environment"] == "sandbox" and order["payment_account"] == "simulation"
    path = f"/v1/admin/payment-test/orders/{reference}/complete"
    for _ in range(2):
        result = s["client"].post(path, json={})
        assert result.status_code == 200, result.text
        assert result.json()["payment_state"] == "completed"
    club = s["client"].get("/v1/club").json()
    assert club["points"] == 1
    assert "SIMULATED TEST" in club["activity"][0]["description"]
    assert club["activity"][0]["receipt_reference"] == reference
    with Session(s["engine"]) as db:
        assert db.get(ClubAccount,"buyer").spend_minor == 10000
        assert db.get(ClubOrder,reference).paid_minor == 10000
        assert not list(db.scalars(select(SalesRecord)))
    assert s["client"].post(f"/v1/payments/pesapal/orders/{reference}/start",json={}).status_code == 409
    receipt=s["client"].get(f"/v1/app-orders/{reference}/receipt").json()
    assert "No money charged" in receipt["notice"] and receipt["payment_test"]
    role(s,"production")
    assert s["client"].get("/v1/admin/app-orders").status_code == 200
    for state in ("preparing","ready"):
        response=s["client"].patch(f"/v1/admin/app-orders/{reference}",json={"status":state})
        assert response.status_code == 200, response.text
    assert s["client"].patch(f"/v1/admin/app-orders/{reference}",json={"status":"out_for_delivery"}).status_code == 403
    role(s,"dispatch")
    response=s["client"].put(f"/v1/admin/app-orders/{reference}/dispatch",json={"rider_name":"Test Rider","rider_phone":"0712345678","note":"Simulation only"})
    assert response.status_code == 200, response.text
    assert s["client"].patch(f"/v1/admin/app-orders/{reference}",json={"status":"completed"}).status_code == 409
    for state in ("out_for_delivery","completed"):
        response=s["client"].patch(f"/v1/admin/app-orders/{reference}",json={"status":state})
        assert response.status_code == 200, response.text
    tracking=s["client"].get(f"/v1/app-orders/{reference}").json()
    assert tracking["status"] == "completed"
    assert tracking["dispatch"]["rider_name"] == "Test Rider"
    assert {e["kind"] for e in tracking["events"]} == {"payment_completed","fulfilment_preparing","fulfilment_ready","fulfilment_out_for_delivery","fulfilment_completed"}
    assert not s["calls"], "Simulation must never contact Pesapal or the website"


def test_test_boundary_and_repeat_purchases(system):
    s=system
    assert s["client"].post("/v1/admin/payment-test/product",json={}).status_code == 403
    role(s,"admin")
    for index in range(2):
        order,data=create(s,"pickup")
        path=f"/v1/admin/payment-test/orders/{order['reference']}/complete"
        assert s["client"].post(path,json={}).status_code == 200
        assert s["client"].get("/v1/club").json()["points"] == index+1
    data["items"][0]["quantity"]=2
    assert s["client"].post("/v1/app-checkout/quote",json=data).status_code == 422
    data["items"][0]["quantity"]=1
    role(s,"customer")
    assert s["client"].post("/v1/app-checkout/quote",json=data).status_code == 403
    assert s["client"].get("/v1/catalogue/products?search=payment").json() == []
    assert s["client"].get("/v1/admin/app-orders").status_code == 403
    assert s["client"].post(path,json={}).status_code == 403


def test_simulation_cannot_confirm_an_ordinary_order_or_another_staff_members_order(system):
    from test_pesapal import place
    s=system
    role(s,"admin")
    ordinary=place(s).json()
    assert s["client"].post(f"/v1/admin/payment-test/orders/{ordinary['reference']}/complete",json={}).status_code == 403
    order,_=create(s,"pickup")
    role(s,"admin","other")
    assert s["client"].post(f"/v1/admin/payment-test/orders/{order['reference']}/complete",json={}).status_code == 404
    role(s,"admin")
    assert s["client"].post(f"/v1/admin/payment-test/orders/{order['reference']}/complete",json={}).status_code == 200
    for state in ("preparing","ready","completed"):
        response=s["client"].patch(f"/v1/admin/app-orders/{order['reference']}",json={"status":state})
        assert response.status_code == 200, response.text
    assert s["client"].get(f"/v1/app-orders/{order['reference']}").json()["status"] == "completed"


@pytest.mark.parametrize("environment", ["production", "PRODUCTION", "staging", "unknown"])
def test_staff_simulations_cannot_run_on_production_or_unapproved_servers(system, monkeypatch, environment):
    s = system
    role(s, "admin")
    order, payload = create(s, "pickup")
    monkeypatch.setattr(get_settings(), "environment", environment)
    assert s["client"].post("/v1/admin/payment-test/product", json={}).status_code == 403
    assert s["client"].post("/v1/app-checkout/quote", json=payload).status_code == 403
    assert s["client"].post(f"/v1/admin/payment-test/orders/{order['reference']}/complete", json={}).status_code == 403
    with Session(s["engine"]) as db:
        stored = db.scalar(select(AppOrder).where(AppOrder.reference == order["reference"]))
        assert stored.payment_state == "not_started"
        assert db.get(ClubAccount, "buyer") is None
        assert not list(db.scalars(select(SalesRecord)))
