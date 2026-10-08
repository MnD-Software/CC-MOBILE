from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routes_club import member
from app import routes_tracking


@pytest.fixture
def tracking(monkeypatch):
    order = {"id": 123, "order_key": "wc_order_private123", "billing": {"email": "buyer@example.com", "phone": "private"}, "currency": "KES", "total": "2500.50", "status": "processing", "line_items": [{"id": 8, "name": "Lotus", "quantity": 1}], "payment_method": "private"}
    async def read_order(order_id):
        assert order_id == 123
        return order
    monkeypatch.setattr(routes_tracking, "read_order", read_order)
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="member")
    with TestClient(app) as client:
        yield client, order
    app.dependency_overrides.clear()


def test_receipt_tracking_returns_only_verified_status_and_items(tracking):
    client, _ = tracking
    response = client.post("/v1/orders/track", json={"order_id": 123, "order_key": "wc_order_private123", "billing_email": "BUYER@example.com"})
    assert response.status_code == 200
    assert response.json() == {"id": 123, "status": "processing", "items": [{"id": 8, "name": "Lotus", "quantity": 1}], "coupons": [], "totals": {"total_price": "250050", "currency_code": "KES", "currency_minor_unit": 2}}


@pytest.mark.parametrize("key,email", [("wc_order_wrong123", "buyer@example.com"), ("wc_order_private123", "other@example.com")])
def test_receipt_tracking_requires_both_private_key_and_matching_email(tracking, key, email):
    client, _ = tracking
    response = client.post("/v1/orders/track", json={"order_id": 123, "order_key": key, "billing_email": email})
    assert response.status_code == 403
    assert "250050" not in response.text


def test_receipt_tracking_requires_app_sign_in():
    with TestClient(app) as client:
        response = client.post("/v1/orders/track", json={"order_id": 123, "order_key": "wc_order_private123", "billing_email": "buyer@example.com"})
    assert response.status_code == 401
