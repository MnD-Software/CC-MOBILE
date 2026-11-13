from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .config import get_settings
from .models import RefreshToken
from .security import token_hash
from .routes_club import member
from .notification_models import AccountNotification, NotificationPreference, PushDevice, OrderReview
from .commerce_models import AppOrder
from .app_commerce import utc
from .routes_enquiries import staff

router = APIRouter(tags=["notifications-and-reviews"])


@router.post("/v1/account/notifications/test")
def test_notification(actor=Depends(member), db: Session = Depends(get_db)):
    if not get_settings().push_enabled:
        raise HTTPException(503, "Phone notification delivery is not enabled on the server yet.")
    # Serialize this account's requests so repeated taps enqueue at most once per minute.
    from .models import Customer
    from .notifications import enqueue
    db.scalar(select(Customer).where(Customer.id == actor.id).with_for_update())
    preference = db.get(NotificationPreference, actor.id)
    if preference and not preference.order_updates:
        raise HTTPException(409, "Enable order push alerts first.")
    if not db.scalar(select(PushDevice.id).where(PushDevice.customer_id == actor.id, PushDevice.enabled.is_(True)).limit(1)):
        raise HTTPException(409, "Enable phone notifications on this device first.")
    minute = datetime.now(UTC).strftime("%Y%m%d%H%M")
    enqueue(db, actor.id, f"push-test:{actor.id}:{minute}", "delivery_test",
            "You're connected to Cake City", "Your phone can receive Cake City updates.", {"url": "/notifications"})
    db.commit()
    return {"queued": True, "delivery_confirmed": False}


@router.get("/v1/admin/notifications/status")
def push_status(actor=Depends(staff), db: Session = Depends(get_db)):
    from sqlalchemy import func
    from .notification_models import PushJob
    counts = dict(db.execute(select(PushJob.state, func.count()).group_by(PushJob.state)).all())
    return {"push_enabled": get_settings().push_enabled, "jobs": counts,
            "active_devices": db.scalar(select(func.count()).select_from(PushDevice).where(PushDevice.enabled.is_(True)))}


@router.get("/v1/admin/order-reviews")
def reviews(before: int | None = Query(default=None, gt=0), limit: int = Query(default=30, ge=1, le=100),
            actor=Depends(member), db: Session = Depends(get_db)):
    if actor.role not in {"admin", "staff", "ecommerce_manager", "customer_service"}:
        raise HTTPException(403, "Customer feedback access required.")
    query = select(OrderReview, AppOrder.reference).join(AppOrder, OrderReview.order_id == AppOrder.id)
    if before:
        query = query.where(OrderReview.order_id < before)
    return [{"reference": ref, "order_id": row.order_id, **review_view(row)}
            for row, ref in db.execute(query.order_by(OrderReview.order_id.desc()).limit(limit))]


class DeviceInput(BaseModel):
    token: str = Field(pattern=r"^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$")
    platform: Literal["android", "ios"]
    provider: Literal["expo"] = "expo"
    refresh_token: str = Field(min_length=32, max_length=512)


@router.post("/v1/account/notifications/devices")
def register(data: DeviceInput, actor=Depends(member), db: Session = Depends(get_db)):
    digest = token_hash(data.refresh_token)
    # Same lock as refresh rotation/logout to avoid binding to a revoked session.
    session = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest).with_for_update())
    if not session or session.customer_id != actor.id or session.revoked or utc(session.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "Sign in again to enable notifications.")
    device = db.scalar(select(PushDevice).where(PushDevice.token == data.token).with_for_update())
    if not device:
        device = PushDevice(id=str(uuid4()), token=data.token, generation=str(uuid4()))
        db.add(device)
    if device.customer_id != actor.id or device.session_hash != digest or not device.enabled:
        device.generation = str(uuid4())
    device.customer_id, device.session_hash, device.platform = actor.id, digest, data.platform
    device.enabled, device.updated_at = True, datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Device registration changed. Please try again.") from None
    return {"registered": True, "push_service_enabled": get_settings().push_enabled}


@router.delete("/v1/account/notifications/devices")
def unregister(actor=Depends(member), db: Session = Depends(get_db)):
    # Explicit account-wide opt-out; doesn't erase the account's inbox.
    db.execute(update(PushDevice).where(PushDevice.customer_id == actor.id).values(enabled=False))
    db.commit()
    return {"disabled": True}


class PreferencesInput(BaseModel):
    order_updates: bool


@router.get("/v1/account/notifications/preferences")
def preferences(actor=Depends(member), db: Session = Depends(get_db)):
    row = db.get(NotificationPreference, actor.id)
    return {"order_updates": row.order_updates if row else True, "marketing": False,
            "push_service_enabled": get_settings().push_enabled}


@router.patch("/v1/account/notifications/preferences")
def save_preferences(data: PreferencesInput, actor=Depends(member), db: Session = Depends(get_db)):
    row = db.get(NotificationPreference, actor.id)
    if not row:
        row = NotificationPreference(customer_id=actor.id)
        db.add(row)
    row.order_updates = data.order_updates
    db.commit()
    return preferences(actor, db)


@router.get("/v1/account/notifications")
def inbox(before: str | None = None, limit: int = Query(default=30, ge=1, le=100), actor=Depends(member), db: Session = Depends(get_db)):
    query = select(AccountNotification).where(AccountNotification.customer_id == actor.id)
    if before:
        cursor = db.get(AccountNotification, before)
        if not cursor or cursor.customer_id != actor.id:
            raise HTTPException(404, "Notification not found.")
        from sqlalchemy import or_, and_
        query = query.where(or_(AccountNotification.created_at < cursor.created_at,
                            and_(AccountNotification.created_at == cursor.created_at, AccountNotification.id < cursor.id)))
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "data": n.data,
             "read_at": utc(n.read_at).isoformat() if n.read_at else None, "created_at": utc(n.created_at).isoformat()}
            for n in db.scalars(query.order_by(AccountNotification.created_at.desc(), AccountNotification.id.desc()).limit(limit))]


@router.post("/v1/account/notifications/{identity}/read")
def read(identity: str, actor=Depends(member), db: Session = Depends(get_db)):
    row = db.get(AccountNotification, identity)
    if not row or row.customer_id != actor.id:
        raise HTTPException(404, "Notification not found.")
    if not row.read_at:
        row.read_at = datetime.now(UTC)
        db.commit()
    return {"read": True}


class ReviewInput(BaseModel):
    rating: int = Field(ge=1, le=5, strict=True)
    comment: str = Field(default="", max_length=1000)


def owned_order(db, reference, actor):
    row = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == actor.id))
    if not row:
        raise HTTPException(404, "Order not found.")
    return row


def review_view(row):
    return {"rating": row.rating, "comment": row.comment, "simulated": row.simulated,
            "created_at": utc(row.created_at).isoformat()} if row else None


@router.get("/v1/app-orders/{reference}/review")
def review(reference: str, actor=Depends(member), db: Session = Depends(get_db)):
    order = owned_order(db, reference, actor)
    return review_view(db.get(OrderReview, order.id))


@router.post("/v1/app-orders/{reference}/review")
def submit_review(reference: str, data: ReviewInput, actor=Depends(member), db: Session = Depends(get_db)):
    order = owned_order(db, reference, actor)
    db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
    db.refresh(order)
    if order.state != "completed" or order.payment_state != "completed" or not order.paid_at:
        raise HTTPException(409, "Rate your order after delivery or collection is complete.")
    row = db.get(OrderReview, order.id)
    if row:
        if row.rating != data.rating or row.comment != data.comment.strip():
            raise HTTPException(409, "Your review has already been submitted.")
        return review_view(row)
    from .order_home import OrderAcknowledgement
    if not db.get(OrderAcknowledgement, order.id):
        raise HTTPException(409, "Confirm you have received your cake before sharing feedback.")
    row = OrderReview(order_id=order.id, customer_id=actor.id, rating=data.rating, comment=data.comment.strip(),
                      simulated=order.channel == "app_test" or order.environment != "live")
    db.add(row)
    db.commit()
    db.refresh(row)
    return review_view(row)
