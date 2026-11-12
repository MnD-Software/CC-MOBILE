from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import Customer
from app.commerce_models import AppOrder
from app.security import hash_password
from app.customer_lifecycle import ClosedAccount
from test_pesapal import system, place, start


def prepare(s):
    with Session(s["engine"]) as db:
        db.get(Customer, "buyer").password_hash = hash_password("Closure-test-password!")
        db.commit()


def close(s):
    return s["client"].post("/v1/account/close", json={"password": "Closure-test-password!", "confirmation": "DELETE"})


def test_pending_payment_prevents_closure(system):
    prepare(system)
    assert start(system).status_code == 200
    assert close(system).status_code == 409
    with Session(system["engine"]) as db:
        assert db.get(ClosedAccount, "buyer") is None


def test_unpaid_draft_is_cancelled_and_cannot_start_payment_after_closure(system):
    prepare(system)
    order = place(system).json()
    assert close(system).status_code == 200
    with Session(system["engine"]) as db:
        saved = db.scalar(select(AppOrder).where(AppOrder.reference == order["reference"]))
        assert saved.state == "cancelled"
        assert saved.inventory_state == "released"
    assert system["client"].post(f"/v1/payments/pesapal/orders/{order['reference']}/start").status_code == 401
    assert not system["calls"]
