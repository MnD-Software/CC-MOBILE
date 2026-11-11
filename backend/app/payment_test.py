"""Restricted simulated orders. Owner-authorized KES 100 qualification in the normal Club."""
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import update

from .permissions import audit
from .commerce_models import AppOrder, AppProduct
from .config import get_settings

PRODUCT_ID = 2147483000
ROLES = {"admin", "staff", "ecommerce_manager"}


def require_test_environment():
    # Staff privileges must never enable simulated purchases on a production server.
    if get_settings().environment.strip().casefold() not in {"development", "test"}:
        raise HTTPException(403, "Simulated purchases require the isolated local review backend. Production payments cannot be simulated.")


def require_tester(customer):
    if not customer or customer.role not in ROLES:
        raise HTTPException(403, "Payment testing is available to app commerce staff only.")
    require_test_environment()


def ensure_product(db):
    require_test_environment()
    product = db.get(AppProduct, PRODUCT_ID)
    if product and not product.payload.get("payment_test"):
        raise HTTPException(409, "The reserved payment-test product ID is already in use.")
    if not product:
        product = AppProduct(id=PRODUCT_ID, slug="app-payment-test-1-kes", price_minor=100,
            enabled=True, allocation=0, payload={"id": PRODUCT_ID, "slug": "app-payment-test-1-kes",
                "name": "TEST - KES 1 payment", "type": "simple", "payment_test": True,
                "order_mode": "made_to_order", "images": [], "categories": [],
                "description": "Simulated KES 1 purchase with KES 100 Club qualifying value. No money is charged."})
        db.add(product)
        db.flush()
    return product


def complete(db, order, actor):
    require_tester(actor)
    db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
    db.refresh(order)
    if (order.customer_id != actor.id or order.channel != "app_test"
            or not order.snapshot.get("payment_test") or order.total_minor != 100):
        raise HTTPException(403, "Only your dedicated KES 1 test order can be simulated.")
    if order.payment_state not in ("not_started", "completed"):
        raise HTTPException(409, "This test order cannot be completed in its current state.")
    if order.payment_state != "completed":
        from . import app_commerce as commerce
        commerce.inventory_transition(db, order, paid=True)
        order.payment_state = "completed"
        order.state = "paid"
        order.paid_at = datetime.now(UTC)
        commerce.record_event(db, order, "payment_completed", simulated=True, actor_id=actor.id)
        audit(db, actor.id, "test_purchase_completed", order.reference, qualifying_minor=10000, amount_minor=100)
    db.flush()
    from .routes_club import OrderEvent, apply_order_event
    apply_order_event(OrderEvent(event_id=f"app-{order.reference}-completed", order_id=order.reference,
        customer_id=order.customer_id, paid_minor=10000), db)
    db.commit()
    from .app_commerce import tracked_order_view
    return tracked_order_view(db, order)
