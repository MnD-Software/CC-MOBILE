"""Customer-facing readiness, Odoo notifications and scoped pickup handover."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_logistics import delivery, actor, assign, ready
from test_pesapal import system
from app.commerce_models import AppOrder
from app.notification_models import AccountNotification
from app.logistics import import_kitchen
from app.config import get_settings
from app.odoo_models import OdooOutbox


def test_ready_for_dispatch_notification_links_to_owned_tracking_and_does_not_repeat(delivery):
    s = delivery
    assign(s)
    ready(s)
    repeat = s["client"].patch(f"/v1/kitchen/orders/{s['reference']}/status", json={"status": "ready"})
    assert repeat.status_code == 200
    actor("buyer", "customer")
    messages = s["client"].get("/v1/account/notifications").json()
    ready_messages = [item for item in messages if item["kind"] == "fulfilment_ready"]
    assert len(ready_messages) == 1
    assert "ready for dispatch" in ready_messages[0]["title"].lower()
    assert ready_messages[0]["data"]["reference"] == s["reference"]
    assert s["client"].get("/v1/app-orders/" + s["reference"]).json()["status"] == "ready"
    actor("other-rider", "rider")
    assert s["client"].get("/v1/app-orders/" + s["reference"]).status_code == 404


def test_odoo_kitchen_events_use_the_same_customer_notification_path(delivery, monkeypatch):
    s = delivery
    monkeypatch.setattr(get_settings(), "odoo_enabled", True)
    with Session(s["engine"]) as db:
        for status in ("preparing", "ready", "ready"):
            import_kitchen(db, {"reference": s["reference"], "plant": "hq", "assigned_to": "chef", "status": status})
            db.commit()
        kinds = list(db.scalars(select(AccountNotification.kind).where(AccountNotification.customer_id == "buyer")))
        assert kinds.count("fulfilment_preparing") == 1
        assert kinds.count("fulfilment_ready") == 1
        assert not list(db.scalars(select(OdooOutbox)))  # No echo back to Odoo.


def test_pickup_collection_requires_kitchen_readiness_and_workspace_scope(delivery):
    s = delivery
    assign(s)
    path = f"/v1/logistics/orders/{s['reference']}/collection"
    actor()
    assert s["client"].post(path).status_code == 409  # delivery is not pickup
    with Session(s["engine"]) as db:
        order = db.scalar(select(AppOrder).where(AppOrder.reference == s["reference"]))
        snapshot = dict(order.snapshot)
        snapshot["checkout"] = {**snapshot["checkout"], "fulfilment": "pickup"}
        order.snapshot = snapshot
        db.commit()
    assert s["client"].post(path).status_code == 409
    ready(s)
    actor("branch", "branch_manager")
    assert s["client"].post(path).status_code == 403
    actor()
    assert s["client"].post(path).json()["status"] == "completed"
    assert s["client"].post(path).json()["status"] == "completed"
    actor("buyer", "customer")
    assert s["client"].get("/v1/app-orders/" + s["reference"]).json()["status"] == "completed"
    messages = s["client"].get("/v1/account/notifications").json()
    assert any(item["kind"] == "fulfilment_ready" and "collection" in item["title"] for item in messages)
    assert len([item for item in messages if item["kind"] == "fulfilment_completed"]) == 1
