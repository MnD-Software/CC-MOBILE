"""All-product, no-charge checkout. Mounted only by the isolated preview factory."""
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import app_commerce as commerce
from .commerce_models import AppOrder
from .config import get_settings
from .db import get_db
from .permissions import audit
from .routes_club import member


def require_local_review():
    settings = get_settings()
    expected = "sqlite:///" + (Path(__file__).resolve().parents[2] / "artifacts/local-preview/review.db").as_posix()
    if (settings.environment != "development" or settings.sqlalchemy_url != expected
            or settings.app_public_url != "http://127.0.0.1:8010"
            or settings.pesapal_consumer_key or settings.pesapal_consumer_secret
            or settings.odoo_enabled or settings.odoo_loyalty_authority):
        raise HTTPException(403, "This checkout is unavailable on this server.")


def progress_value(purchases):
    thresholds = [0, 2000000, 5000000, 10000000]
    if purchases >= 9: return thresholds[-1] + (purchases - 9) * 10000
    tier, step = divmod(max(0, purchases), 3)
    return thresholds[tier] + (thresholds[tier + 1] - thresholds[tier]) * step // 3


def count_purchases(db, customer_id):
    return db.scalar(select(func.count()).select_from(AppOrder).where(
        AppOrder.customer_id == customer_id, AppOrder.channel == "app_test",
        AppOrder.payment_state == "completed", AppOrder.snapshot["review_checkout"].as_boolean().is_(True))) or 0


router = APIRouter(tags=["isolated-review-checkout"])


@router.get("/v1/review-checkout/config")
def config():
    require_local_review()
    return {"enabled": True, "due_now_minor": 0, "purchases_per_milestone": 3}


@router.post("/v1/review-checkout/orders")
def place(data: commerce.PlaceOrder, idempotency_key: str = Header(alias="Idempotency-Key", min_length=16, max_length=80),
          actor=Depends(member), db: Session = Depends(get_db)):
    require_local_review()
    order = commerce.place(db, actor.id, data.quote_id, idempotency_key, "local-review", "sandbox", review=True)
    if not order.snapshot.get("review_checkout") or order.customer_id != actor.id:
        raise HTTPException(409, "This request belongs to another checkout.")
    if order.payment_state not in {"not_started", "completed"}:
        raise HTTPException(409, "Open this existing order before trying again.")
    if order.payment_state != "completed":
        commerce.inventory_transition(db, order, paid=True)
        previous = count_purchases(db, actor.id)
        order.payment_state, order.state, order.paid_at = "completed", "paid", datetime.now(UTC)
        commerce.record_event(db, order, "payment_completed", collected_minor=0, review_checkout=True)
        audit(db, actor.id, "review_order_confirmed", order.reference, collected_minor=0, catalogue_total_minor=order.total_minor)
        db.flush()
        from .routes_club import OrderEvent, apply_order_event
        apply_order_event(OrderEvent(event_id=f"review-{order.reference}-confirmed", order_id=order.reference,
            customer_id=actor.id, paid_minor=progress_value(previous + 1) - progress_value(previous)), db)
    db.commit()
    return commerce.tracked_order_view(db, order)
