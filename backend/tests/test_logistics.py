"""Kitchen-to-rider lifecycle on the real local APIs; provider calls are mocked."""
from copy import deepcopy
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_pesapal import system, start, verify
from app.main import app
from app.models import Customer
from app.logistics_models import LogisticsEvent, LogisticsScope, LogisticsTask
from app.routes_club import member
from app.security import hash_password


def actor(identity="buyer", role="admin"):
    app.dependency_overrides[member] = lambda: SimpleNamespace(id=identity, role=role)


@pytest.fixture
def delivery(system):
    s = system
    s["payload"]["fulfilment"] = "delivery"
    s["payload"]["delivery_zone_id"] = "zone"
    s["amount"] = 2800
    assert start(s).status_code == 200
    assert verify(s).status_code == 200
    with Session(s["engine"]) as db:
        for identity, role in [("chef", "production"), ("rider", "rider"), ("other-rider", "rider"), ("branch", "branch_manager")]:
            db.add(Customer(id=identity, role=role, first_name=identity, last_name="Test", email=identity+"@logistics.example.com",
                phone="0712345678", password_hash=hash_password("LogisticsTestPassword!")))
        db.add(LogisticsScope(customer_id="branch", plant="branch:westlands"))
        db.commit()
    actor()
    return s


def assign(s):
    response = s["client"].put(f"/v1/kitchen/orders/{s['reference']}/assignment", json={"plant": "hq", "assigned_to": "chef"})
    assert response.status_code == 200, response.text


def ready(s):
    actor("chef", "production")
    for state in ("preparing", "ready"):
        response = s["client"].patch(f"/v1/kitchen/orders/{s['reference']}/status", json={"status": state})
        assert response.status_code == 200, response.text


def trip(s, **extra):
    actor()
    response = s["client"].post(f"/v1/logistics/orders/{s['reference']}/tasks", json={"rider_id": "rider", **extra})
    assert response.status_code == 201, response.text
    return response.json()


def progress(s, task, state, **extra):
    actor("rider", "rider")
    response = s["client"].patch(f"/v1/rider/tasks/{task['id']}", json={"revision": task["revision"], "status": state, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def test_kitchen_rider_delivery_and_customer_tracking_work_without_odoo(delivery):
    s = delivery
    assign(s)
    task = trip(s)
    actor("rider", "rider")
    assert len(s["client"].get("/v1/rider/tasks").json()) == 1
    task = progress(s, task, "accepted")
    response = s["client"].patch(f"/v1/rider/tasks/{task['id']}", json={"revision": task["revision"], "status": "collected"})
    assert response.status_code == 409  # kitchen readiness is mandatory
    ready(s)
    for state in ("collected", "in_transit"):
        task = progress(s, task, state)
    assert s["client"].patch(f"/v1/rider/tasks/{task['id']}", json={"revision": task["revision"], "status": "delivered"}).status_code == 422
    task = progress(s, task, "delivered", proof="Received by test recipient")
    actor("buyer", "customer")
    order = s["client"].get("/v1/app-orders/"+s["reference"]).json()
    assert order["status"] == "completed"
    assert order["deliveries"][0]["status"] == "delivered"
    assert "proof" not in order["deliveries"][0]
    assert {e["kind"] for e in order["events"]} >= {"fulfilment_preparing", "fulfilment_ready", "fulfilment_out_for_delivery", "fulfilment_completed"}


def test_rider_cannot_see_or_update_another_riders_trip(delivery):
    assign(delivery)
    task = trip(delivery)
    actor("other-rider", "rider")
    assert delivery["client"].get("/v1/rider/tasks").json() == []
    assert delivery["client"].patch(f"/v1/rider/tasks/{task['id']}", json={"revision": 1, "status": "accepted"}).status_code == 404
    assert delivery["client"].get("/v1/logistics/tasks").status_code == 403
    assert delivery["client"].get("/v1/kitchen/orders").status_code == 403


def test_branch_cannot_assign_hq_production_or_dispatch(delivery):
    assign(delivery)
    actor("branch", "branch_manager")
    assert delivery["client"].get("/v1/logistics/orders").json() == []
    response = delivery["client"].post(f"/v1/logistics/orders/{delivery['reference']}/tasks", json={"rider_id": "rider"})
    assert response.status_code == 403


def test_kitchen_does_not_expose_payment_or_customer_contact_details(delivery):
    actor("chef", "production")
    response = delivery["client"].get("/v1/kitchen/orders")
    assert response.status_code == 200
    row = response.json()[0]
    assert row["attention"] == "unassigned"
    assert not {"phone", "email", "billing", "tracking_id", "total_minor"} & row.keys()


def test_stale_rider_actions_and_dispatch_bypass_are_rejected(delivery):
    assign(delivery)
    task = trip(delivery)
    original = deepcopy(task)
    task = progress(delivery, task, "accepted")
    actor("rider", "rider")
    assert delivery["client"].patch(f"/v1/rider/tasks/{task['id']}", json={"revision": original["revision"], "status": "failed", "note": "Test issue"}).status_code == 409
    ready(delivery)
    actor()
    assert delivery["client"].patch(f"/v1/admin/app-orders/{delivery['reference']}", json={"status": "out_for_delivery"}).status_code == 409


def test_trip_allocation_cannot_duplicate_paid_items(delivery):
    assign(delivery)
    trip(delivery)
    actor()
    assert delivery["client"].post(f"/v1/logistics/orders/{delivery['reference']}/tasks", json={"rider_id": "rider"}).status_code == 409


def test_failure_remains_visible_and_does_not_complete_order(delivery):
    assign(delivery)
    task = trip(delivery)
    progress(delivery, task, "failed", note="Recipient unavailable")
    actor()
    tasks = delivery["client"].get("/v1/logistics/tasks").json()
    assert tasks[0]["status"] == "failed"
    assert delivery["client"].get("/v1/app-orders/"+delivery["reference"]).json()["status"] != "completed"


def test_real_rider_login_and_current_role_are_enforced(delivery):
    app.dependency_overrides.pop(member)
    response = delivery["client"].post("/v1/auth/mobile/login", json={"email": "rider@logistics.example.com", "password": "LogisticsTestPassword!"})
    assert response.status_code == 200
    headers = {"Authorization": "Bearer "+response.json()["access_token"]}
    assert delivery["client"].get("/v1/rider/tasks", headers=headers).status_code == 200
    with Session(delivery["engine"]) as db:
        db.get(Customer, "rider").role = "customer"
        db.commit()
    assert delivery["client"].get("/v1/rider/tasks", headers=headers).status_code == 403


def test_split_deliveries_complete_parent_only_after_every_paid_item(system):
    s = system
    s["payload"]["items"][0]["quantity"] = 2
    s["payload"]["fulfilment"] = "delivery"
    s["payload"]["delivery_zone_id"] = "zone"
    s["amount"] = 5300
    assert start(s).status_code == 200
    assert verify(s).status_code == 200
    with Session(s["engine"]) as db:
        for identity, role in [("chef", "production"), ("rider", "rider")]:
            db.add(Customer(id=identity, role=role, first_name=identity, last_name="Test", email=identity+"@split.example.com", password_hash="unused"))
        db.commit()
    actor()
    assign(s)
    first = trip(s, destination="First location", items=[{"sku_id": 12, "quantity": 1}])
    second = trip(s, destination="Second location", items=[{"sku_id": 12, "quantity": 1}])
    ready(s)
    for initial in (first, second):
        task = initial
        for state in ("accepted", "collected", "in_transit", "delivered"):
            task = progress(s, task, state, proof="Received by recipient")
        actor("buyer", "customer")
        order = s["client"].get("/v1/app-orders/"+s["reference"]).json()
        assert order["status"] == ("out_for_delivery" if initial is first else "completed")
    assert len(order["deliveries"]) == 2


def test_odoo_task_import_assigns_only_explicitly_linked_rider(delivery, monkeypatch):
    from app.config import get_settings
    from app.odoo_models import OdooBinding
    from app.odoo_sync import Change, apply_change
    monkeypatch.setattr(get_settings(), "odoo_enabled", True)
    monkeypatch.setattr(get_settings(), "odoo_source_id", "logistics-test")
    assign(delivery)
    event = Change(event_id="odoo-trip-1", resource="logistics_tasks", record_id="37", version=1,
        payload={"reference": delivery["reference"], "rider_id": "odoo-rider-7", "status": "assigned"})
    with Session(delivery["engine"]) as db:
        with pytest.raises(Exception, match="Explicitly link"):
            apply_change(db, event)
        db.rollback()
        db.add(OdooBinding(source="logistics-test", resource="riders", external_id="odoo-rider-7", local_id="rider", version=1,
            payload={"name": "Mapped Rider", "phone": "0712345678", "active": True}))
        db.commit()
        assert apply_change(db, event) == "accepted"
        db.commit()
        assert apply_change(db, event) == "duplicate"
        db.commit()
    actor("rider", "rider")
    tasks = delivery["client"].get("/v1/rider/tasks").json()
    assert len(tasks) == 1 and tasks[0]["reference"] == delivery["reference"]
