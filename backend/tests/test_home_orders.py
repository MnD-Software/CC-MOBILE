from sqlalchemy import select
from sqlalchemy.orm import Session
from app.commerce_models import AppOrder
from app.order_home import OrderAcknowledgement
from test_pesapal import system
from test_order_history_filters import seed
from test_logistics import actor


def test_home_updates_include_delivered_until_owner_acknowledges_and_do_not_complete_active_orders(system):
    seed(system)
    client=system["client"]
    response=client.get("/v1/account/home-orders")
    assert response.status_code == 200, response.text
    refs={row["reference"] for row in response.json()["data"]}
    assert refs == {"APP-CHOC-OLDER","APP-CHOC-TODAY","APP-VANILLA","APP-ACTIVE"}
    assert "private@example.com" not in response.text
    assert client.post("/v1/app-orders/APP-ACTIVE/received").status_code == 409
    for _ in range(2):
        assert client.post("/v1/app-orders/APP-VANILLA/received").json()["received"] is True
    assert "APP-VANILLA" not in {r["reference"] for r in client.get("/v1/account/home-orders").json()["data"]}
    with Session(system["engine"]) as db:
        order=db.scalar(select(AppOrder).where(AppOrder.reference == "APP-VANILLA"))
        assert order.state == "completed"
        assert db.get(OrderAcknowledgement,order.id)
    # The receipt remains in past orders; dismissing Home never deletes a purchase.
    assert "APP-VANILLA" in {r["reference"] for r in client.get("/v1/app-orders?scope=past").json()["data"]}
    actor("other","customer")
    assert client.post("/v1/app-orders/APP-CHOC-TODAY/received").status_code == 404


def test_receipt_counter_counts_all_owned_orders_and_updates_after_acknowledgement(system):
    seed(system)
    with Session(system["engine"]) as db:
        from uuid import uuid4
        for index in range(8):
            db.add(AppOrder(reference=f"APP-EXTRA-{index}", customer_id="buyer", request_key=uuid4().hex,
                request_digest="test", account_id="primary", account_fingerprint="test", environment="live",
                state="completed", payment_state="completed", snapshot={"lines": []},
                subtotal_minor=100, total_minor=100, discount_minor=0, delivery_minor=0))
        db.commit()
    client = system["client"]
    response = client.get("/v1/account/home-orders")
    assert response.headers["cache-control"] == "private, no-store"
    summary = response.json()
    assert len(summary["data"]) == 5
    assert summary["total"] == 12
    assert summary["awaiting_receipt_count"] == 11
    first = client.get("/v1/app-orders?scope=past&awaiting_receipt=true&limit=4").json()
    assert len(first["data"]) == 4
    second = client.get(f"/v1/app-orders?scope=past&awaiting_receipt=true&before={first['next_cursor']}").json()
    refs = {row["reference"] for row in first["data"] + second["data"]}
    assert len(refs) == 11
    assert not {"APP-OTHER", "APP-ACTIVE", "APP-CANCELLED"} & refs
    for _ in range(2):
        assert client.post("/v1/app-orders/APP-CHOC-OLDER/received").status_code == 200
    assert client.get("/v1/account/home-orders").json()["awaiting_receipt_count"] == 10
    remaining = client.get("/v1/app-orders?scope=past&awaiting_receipt=true").json()["data"]
    assert len(remaining) == 10
    assert "APP-CHOC-OLDER" not in {row["reference"] for row in remaining}
    actor("other", "customer")
    other = client.get("/v1/account/home-orders").json()
    assert other["total"] == other["awaiting_receipt_count"] == 1
    assert [row["reference"] for row in client.get("/v1/app-orders?awaiting_receipt=true").json()["data"]] == ["APP-OTHER"]
    actor("buyer", "customer")
    assert client.post("/v1/app-orders/APP-ACTIVE/received").status_code == 409
    assert client.get("/v1/account/home-orders").json()["awaiting_receipt_count"] == 10
    for row in remaining:
        assert client.post(f"/v1/app-orders/{row['reference']}/received").status_code == 200
    cleared = client.get("/v1/account/home-orders").json()
    assert cleared["awaiting_receipt_count"] == 0
    assert cleared["total"] == 1  # The kitchen order remains active.
    assert client.get("/v1/app-orders?awaiting_receipt=true").json()["data"] == []
