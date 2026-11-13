"""Customer-owned home milestones and idempotent receipt acknowledgement."""
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import DateTime, ForeignKey, select, func, update
from sqlalchemy.orm import Mapped, mapped_column, Session
from .db import Base, get_db
from .routes_club import member
from .commerce_models import AppOrder
from .app_commerce import order_view


class OrderAcknowledgement(Base):
    __tablename__ = "order_acknowledgements"
    order_id: Mapped[int] = mapped_column(ForeignKey("app_orders.id"), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


router = APIRouter(tags=["home-order-milestones"])


@router.get("/v1/account/home-orders")
def home_orders(response: Response, actor=Depends(member), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    acknowledged = select(OrderAcknowledgement.order_id)
    query = select(AppOrder).where(AppOrder.customer_id == actor.id,
        AppOrder.payment_state == "completed",
        AppOrder.state.in_(["paid", "preparing", "ready", "out_for_delivery", "completed"]),
        AppOrder.id.notin_(acknowledged))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    awaiting_receipt = db.scalar(select(func.count()).select_from(
        query.where(AppOrder.state == "completed").subquery()))
    rows = db.scalars(query.order_by(AppOrder.id.desc()).limit(5))
    return {"data": [{**order_view(order, private=False),
        "fulfilment": order.snapshot.get("checkout", {}).get("fulfilment", "delivery")} for order in rows],
        "total": total, "awaiting_receipt_count": awaiting_receipt}


@router.post("/v1/app-orders/{reference}/received")
def received(reference: str, actor=Depends(member), db: Session = Depends(get_db)):
    order = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == actor.id).with_for_update())
    if not order:
        raise HTTPException(404, "Order not found")
    db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
    db.refresh(order)
    if order.state != "completed" or order.payment_state != "completed":
        raise HTTPException(409, "You can acknowledge your order after delivery or collection is completed.")
    acknowledgement = db.get(OrderAcknowledgement, order.id)
    if not acknowledgement:
        acknowledgement = OrderAcknowledgement(order_id=order.id, received_at=datetime.now(UTC))
        db.add(acknowledgement)
        from .notifications import enqueue
        from .permissions import audit
        audit(db, actor.id, "customer_receipt_confirmed", order.reference)
        enqueue(db, actor.id, f"satisfaction:{order.id}", "satisfaction_request",
            "How was your cake?", "Your cake, your celebration. Share a quick rating when you're ready.",
            {"reference": order.reference}, remote=order.channel != "app_test" and order.environment == "live")
        db.commit()
    return {"reference": reference, "received": True, "received_at": acknowledgement.received_at}
