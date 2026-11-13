from datetime import UTC, datetime, timedelta
from uuid import uuid4
from sqlalchemy import select
from .notification_models import AccountNotification, NotificationPreference, PushDevice, PushJob


ORDER_MESSAGES = {
    "payment_completed": ("Order confirmed", "Your payment is confirmed. Follow your order in Cake City."),
    "fulfilment_preparing": ("Your cake is being prepared", "Our kitchen has started preparing your order."),
    "fulfilment_ready": ("Your cake is ready", "Your order is ready for the next step. Open it for collection or delivery details."),
    "fulfilment_out_for_delivery": ("Your cake is on its way", "Your rider has started delivery. Follow your order in Cake City."),
    "fulfilment_completed": ("Your cake has arrived! 🎂", "Thank you for choosing Cake City. Enjoy your celebration and tell us how we did."),
    "fulfilment_cancelled": ("Order cancelled", "Your order status has changed to cancelled. Open your order for details or contact support."),
    "payment_reversed": ("Payment update", "Your payment has been reversed. Open your order for details or contact support."),
}


def enqueue(db, customer_id, event_key, kind, title, body, data, remote=True):
    # Flush prevents duplicate events within this same uncommitted transaction.
    db.flush()
    if db.scalar(select(AccountNotification.id).where(AccountNotification.event_key == event_key)):
        return
    row = AccountNotification(id=str(uuid4()), customer_id=customer_id, event_key=event_key,
                              kind=kind, title=title, body=body, data={**data, "customer_id": customer_id})
    db.add(row)
    db.flush()
    preference = db.get(NotificationPreference, customer_id)
    if not remote or (preference and not preference.order_updates):
        return
    now = datetime.now(UTC)
    for device in db.scalars(select(PushDevice).where(PushDevice.customer_id == customer_id, PushDevice.enabled.is_(True))):
        db.add(PushJob(id=str(uuid4()), notification_id=row.id, device_id=device.id,
                       generation=device.generation, available_at=now, expires_at=now+timedelta(hours=24)))


def order_event(db, order, kind):
    if kind not in ORDER_MESSAGES:
        return
    title, body = ORDER_MESSAGES[kind]
    if kind == "fulfilment_ready":
        if order.snapshot.get("checkout", {}).get("fulfilment") == "delivery":
            title, body = "Kitchen complete — ready for dispatch", "Your cake is finished and ready for our dispatch team. We will let you know when your rider sets off."
        else:
            title, body = "Your cake is ready for collection", "The kitchen has finished your cake. Open your order for the collection location and bring your order reference."
    if kind == "fulfilment_completed" and order.snapshot.get("checkout", {}).get("fulfilment") == "pickup":
        title, body = "Your cake has been collected! 🎂", "Enjoy your celebration. Tell us how your Cake City experience went."
    simulated = order.channel == "app_test" or order.environment != "live"
    if simulated and not order.snapshot.get("review_checkout"):
        title = "Test: " + title
        body = "Simulation only — no real payment or delivery. " + body
    enqueue(db, order.customer_id, f"order:{order.reference}:{kind}", kind, title, body,
            {"reference": order.reference, "simulated": simulated}, remote=not simulated)


def rider_event(db, task, order, status):
    if status not in ("assigned", "rescheduled", "cancelled") or not task.rider_id:
        return
    enqueue(db, task.rider_id, f"trip:{task.id}:{task.revision}:{status}", "rider_assignment",
            "Delivery assignment updated", "Open your rider workspace to view your assigned delivery.",
            {"workspace": "rider", "reference": order.reference},
            remote=order.channel != "app_test" and order.environment == "live")
