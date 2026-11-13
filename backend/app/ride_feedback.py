"""Customer-reported delivery quality, recorded per trip in the order audit history."""
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from .db import get_db
from .routes_club import member
from .commerce_models import AppOrder, AppOrderEvent
from .logistics_models import LogisticsTask
from .order_home import OrderAcknowledgement

router = APIRouter(tags=["delivery-feedback"])

class RideFeedback(BaseModel):
    rating: int = Field(ge=1, le=5, strict=True)
    timing: Literal["on_time", "late", "not_sure"]
    condition: Literal["good", "damaged", "other_issue"]
    comment: str = Field(default="", max_length=1000)

def for_task(db, task):
    for event in db.scalars(select(AppOrderEvent).where(AppOrderEvent.order_id == task.order_id, AppOrderEvent.kind == "delivery_feedback")):
        if event.details.get("task_id") == task.id:
            return {k: event.details[k] for k in ("rating", "timing", "condition", "comment")}
    return None

@router.post("/v1/app-orders/{reference}/deliveries/{identity}/feedback")
def submit(reference: str, identity: str, data: RideFeedback, actor=Depends(member), db: Session = Depends(get_db)):
    order = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == actor.id).with_for_update())
    if not order:
        raise HTTPException(404, "Order not found")
    db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
    task = db.get(LogisticsTask, identity)
    if not task or task.order_id != order.id or task.service_type != "delivery":
        raise HTTPException(404, "Delivery not found")
    if task.status != "delivered" or not db.get(OrderAcknowledgement, order.id):
        raise HTTPException(409, "Confirm receipt of your cake before rating the delivery.")
    payload = {**data.model_dump(), "comment": data.comment.strip()}
    previous = for_task(db, task)
    if previous:
        if previous != payload:
            raise HTTPException(409, "This delivery has already been rated.")
        return previous
    db.add(AppOrderEvent(id=str(uuid4()), order_id=order.id,
        event_key=f"{order.reference}:delivery_feedback:{task.id}", kind="delivery_feedback",
        details={"task_id": task.id, **payload}))
    db.commit()
    return payload
