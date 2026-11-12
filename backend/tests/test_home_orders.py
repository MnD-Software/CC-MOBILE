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
