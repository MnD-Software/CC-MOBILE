"""Role/data boundaries for the shared web/mobile operations ecosystem."""
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.commerce_models import AppOrder, SalesRecord
from app.logistics_models import LogisticsScope, ProductionTask
from app.permissions import ROLE_PERMISSIONS
from test_pesapal import system
from test_order_history_filters import seed
from test_logistics import actor, delivery, assign, ready, trip

PERIOD = "?from_date=2026-11-12&to_date=2026-11-12"


def summary(system, suffix=PERIOD):
    response = system["client"].get("/v1/staff/overview" + suffix)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return response.json()


def test_customer_cannot_open_staff_metrics_or_directory(system):
    assert system["client"].get("/v1/staff/overview").status_code == 403
    assert system["client"].get("/v1/staff/team").status_code == 403


@pytest.mark.parametrize("role", ROLE_PERMISSIONS)
def test_every_provisionable_role_has_a_department_and_only_relevant_modules(system, role):
    actor("buyer", role)
    data = summary(system)
    modules = {m["id"] for m in data["modules"]}
    assert "overview" in modules
    assert data["department"] and data["kpis"]
    if role in {"production", "head_chef", "dispatch", "branch_dispatch", "branch_manager", "rider", "driver"}:
        assert not modules & {"sales", "products", "payments", "club", "team"}
        assert data["sales"] is None and data["activity"] == []
    if role in {"rider", "driver"}:
        assert modules == {"overview", "rider", "earnings"}
    if role != "admin": assert system["client"].get("/v1/staff/team").status_code == 403


def test_sales_use_real_ledger_kenyan_period_comparison_and_recorded_reversals(system):
    seed(system)
    with Session(system["engine"]) as db:
        for channel, environment, reference, amount, reversal, moment in [
            ("app", "live", "APP-CHOC-TODAY", 250000, 0, "2026-11-11T21:00:00"),
            ("app", "live", "APP-VANILLA", 100000, 20000, "2026-11-12T12:00:00"),
            ("app", "live", "APP-CHOC-OLDER", 50000, 0, "2026-11-11T20:59:59"),
            ("app_test", "sandbox", "SIMULATION", 9000000, 0, "2026-11-12T10:00:00"),
            ("app", "sandbox", "SANDBOX", 8000000, 0, "2026-11-12T10:00:00"),
            ("website", "live", "WEBSITE", 7000000, 0, "2026-11-12T10:00:00"),
        ]:
            db.add(SalesRecord(id=str(uuid4()), channel=channel, environment=environment, reference=reference,
                paid_minor=amount, reversed_minor=reversal, currency="KES", occurred_at=datetime.fromisoformat(moment).replace(tzinfo=UTC)))
        db.commit()
    actor()
    data = summary(system)
    sales = data["sales"]
    assert sales["gross_minor"] == 350000 and sales["net_minor"] == 330000
    assert sales["orders"] == 2 and sales["reversed_minor"] == 20000
    assert sales["average_minor"] == 175000 and sales["previous_net_minor"] == 50000
    assert sales["change_percent"] == 560
    assert sales["trend"] == [{"date": "2026-11-12", "net_minor": 330000, "orders": 2}]
    assert "private@example.com" not in str(data)
    simulated = summary(system, PERIOD + "&mode=simulation")
    assert simulated["sales"] is None
    assert not any(k["format"] == "money" for k in simulated["kpis"])
    for suffix in ["?from_date=2026-11-13&to_date=2026-11-12", "?from_date=2026-01-01&to_date=2026-11-12", "?mode=made-up"]:
        assert system["client"].get("/v1/staff/overview" + suffix).status_code == 422


def test_department_metrics_and_legacy_order_reading_enforce_locations(system):
    seed(system)
    with Session(system["engine"]) as db:
        order = db.scalar(select(AppOrder).where(AppOrder.reference == "APP-ACTIVE"))
        db.add(ProductionTask(order_id=order.id, plant="branch:westlands", assigned_to="buyer", assigned_at=datetime.now(UTC)))
        db.add(LogisticsScope(customer_id="other", plant="branch:westlands"))
        db.commit()
    actor("buyer", "production")
    data = summary(system)
    assert sum(row["count"] for row in data["workload"]) == 0
    assert system["client"].get("/v1/admin/app-orders/APP-ACTIVE").status_code == 404
    actor("other", "branch_manager")
    data = summary(system)
    assert sum(row["count"] for row in data["workload"]) == 1
    rows = system["client"].get("/v1/admin/app-orders").json()
    assert [row["reference"] for row in rows] == ["APP-ACTIVE"]
    assert not {"total_minor", "snapshot", "payment_account", "tracking_id"} & rows[0].keys()
    actor("buyer", "branch_manager")
    assert sum(row["count"] for row in summary(system)["workload"]) == 0


def test_rider_only_sees_own_workload_and_has_no_revenue(delivery):
    assign(delivery)
    ready(delivery)
    trip(delivery)
    actor("rider", "rider")
    own = summary(delivery)
    assert next(k["value"] for k in own["kpis"] if k["key"] == "assigned") == 1
    assert own["sales"] is None
    actor("other-rider", "rider")
    assert next(k["value"] for k in summary(delivery)["kpis"] if k["key"] == "assigned") == 0


def test_admin_directory_and_static_shell_have_no_credentials(system):
    actor()
    assert system["client"].get("/v1/staff/team").status_code == 200
    for path in ["/admin", "/admin/assets/workspace.js", "/admin/assets/dashboard.js", "/admin/assets/dashboard.css"]:
        response = system["client"].get(path)
        assert response.status_code == 200
        assert "fake-secret" not in response.text
