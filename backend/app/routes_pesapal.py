"""Independent app orders and Pesapal payments. No WooCommerce or website requests."""
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Literal
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import select, update, or_, cast, String, func
from sqlalchemy.orm import Session

from . import app_commerce as commerce
from .commerce_models import AppDeliveryZone, AppOrder, AppPolicy, AppQuote, CommerceIssue
from .config import get_settings
from .db import get_db
from .models import Customer
from .pesapal import PREFIX, Provider, account, configured, public_url
from .routes_club import member

router = APIRouter(tags=["independent-app-payments"])


def owned(db, reference, customer_id):
    order = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == customer_id))
    if not order:
        raise HTTPException(404, "App order not found.")
    return order


@router.get(PREFIX + "/config")
def configuration(db: Session = Depends(get_db)):
    policy = db.get(AppPolicy, "checkout")
    ready = bool(policy and policy.payload.get("enabled") and policy.payload.get("pricing_confirmed"))
    return {"available": configured() and ready, "provider": "pesapal-api3", "checkout_owner": "app",
            "environment": account()["environment"] if configured() else get_settings().pesapal_environment,
            "account_id": get_settings().pesapal_account_id, "catalogue_setup_required": not ready,
            "website_dependency": False}


@router.get("/v1/app-checkout/options")
def options(db: Session = Depends(get_db)):
    policy = db.get(AppPolicy, "checkout")
    from . import app_delivery
    delivery = app_delivery.policy(db)
    return {"pickup_enabled": bool(policy and policy.payload.get("pickup_enabled")),
            "distance_delivery": {"enabled": delivery.enabled, "maps_ready": bool(get_settings().google_maps_api_key),
                "map_picker_ready": bool(get_settings().google_maps_browser_key),
                "origin_name": delivery.origin_name, "origin_address": delivery.origin_address,
                "origin": delivery.origin.model_dump() if delivery.origin else None, "radius_km": delivery.radius_km,
                "base_minor": 10000, "per_km_minor": 3000, "transfer_percent": 50,
                "pickup_stores": [s.model_dump() for s in delivery.pickup_stores]},
            "pickup_instructions": policy.payload.get("pickup_instructions", "") if policy else "",
            "delivery_zones": [{"id": z.id, "name": z.name, "fee_minor": z.fee_minor}
                               for z in db.scalars(select(AppDeliveryZone).where(AppDeliveryZone.enabled.is_(True)))]}


@router.post("/v1/app-checkout/quote")
def quote(data: commerce.CheckoutData, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return commerce.quote(db, customer.id, data)


@router.post("/v1/app-orders")
async def create_order(data: commerce.PlaceOrder,
                       idempotency_key: str = Header(alias="Idempotency-Key", min_length=16, max_length=80),
                       customer: Customer = Depends(member), db: Session = Depends(get_db)):
    saved = db.get(AppQuote, data.quote_id)
    simulated = bool(saved and saved.customer_id == customer.id and saved.snapshot.get("payment_test"))
    profile = {"environment": "sandbox"} if simulated else account()
    order = commerce.place(db, customer.id, data.quote_id, idempotency_key,
                           "simulation" if simulated else get_settings().pesapal_account_id, profile["environment"])
    return commerce.order_view(order)


@router.get("/v1/app-orders")
def orders(before: int | None = Query(default=None, gt=0), limit: int = Query(default=30, ge=1, le=100),
           scope: Literal["all", "active", "past"] = "all", from_date: date | None = None,
           to_date: date | None = None, cake: str | None = Query(default=None, max_length=100),
           customer: Customer = Depends(member), db: Session = Depends(get_db)):
    query = select(AppOrder).where(AppOrder.customer_id == customer.id)
    terminal = or_(AppOrder.state.in_(["completed", "cancelled", "payment_failed", "failed", "reversed"]),
                   AppOrder.payment_state.in_(["failed", "cancelled", "reversed"]))
    if scope != "all":
        query = query.where(terminal if scope == "past" else ~terminal)
    if from_date and to_date and from_date > to_date:
        raise HTTPException(422, "Choose an end date on or after the start date.")
    kenya = timezone(timedelta(hours=3))
    if from_date:
        query = query.where(AppOrder.created_at >= datetime.combine(from_date, time.min, kenya).astimezone(UTC))
    if to_date:
        # Inclusive Kenyan calendar date, exclusive next midnight.
        end = datetime.combine(to_date, time.max, kenya).astimezone(UTC)
        query = query.where(AppOrder.created_at <= end)
    term = (cake or "").strip().casefold()
    if term:
        query = query.where(func.lower(cast(AppOrder.snapshot["lines"], String)).contains(term, autoescape=True))
    if before:
        query = query.where(AppOrder.id < before)
    rows = []
    for row in db.scalars(query.order_by(AppOrder.id.desc()).execution_options(yield_per=100)):
        # Search recorded product names, never billing, addresses or gift messages.
        if term and not any(term in str(line.get("name", "")).casefold() for line in row.snapshot.get("lines", [])):
            continue
        rows.append(row)
        if len(rows) > limit:
            break
    return {"data": [commerce.order_view(r, private=False) for r in rows[:limit]],
            "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.get("/v1/app-checkout/recovery")
def recovery(request_key: str = Query(min_length=16, max_length=80), customer: Customer = Depends(member), db: Session = Depends(get_db)):
    order = db.scalar(select(AppOrder).where(AppOrder.customer_id == customer.id, AppOrder.request_key == request_key))
    return {"order": commerce.order_view(order) if order else None}


@router.get("/v1/app-orders/{reference}")
def order_detail(reference: str, response: Response, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    return commerce.tracked_order_view(db, owned(db, reference, customer.id))


@router.post("/v1/app-orders/{reference}/cancel")
def cancel_unstarted(reference: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    order = owned(db, reference, customer.id)
    claim = db.execute(update(AppOrder).where(AppOrder.id == order.id, AppOrder.payment_state == "not_started")
                       .values(payment_state="cancelled"))
    if claim.rowcount != 1:
        raise HTTPException(409, "Payment has already started. Its status must be verified before cancellation.")
    db.refresh(order)
    commerce.inventory_transition(db, order, paid=False)
    order.state = "cancelled"
    commerce.record_event(db, order, "cancelled_before_payment")
    db.commit()
    return commerce.order_view(order)


@router.get("/v1/app-orders/{reference}/receipt")
def receipt(reference: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    order = owned(db, reference, customer.id)
    if not order.paid_at:
        raise HTTPException(409, "A receipt is available only after verified payment.")
    return {**commerce.order_view(order), "receipt_reference": "RCPT-" + order.reference,
            "notice": "SIMULATED TEST receipt. No money charged." if order.channel == "app_test" else "Payment receipt. Fiscal tax invoicing is a separate integration.",
            "payment_reversed": order.payment_state == "reversed"}


@router.post(PREFIX + "/orders/{reference}/start")
async def start_payment(reference: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    # Serialize payment claims with account closure and order creation.
    db.scalar(select(Customer).where(Customer.id == customer.id).with_for_update())
    from .customer_lifecycle import ClosedAccount
    if db.get(ClosedAccount, customer.id):
        raise HTTPException(401, "This account is closed.")
    order = owned(db, reference, customer.id)
    if order.channel == "app_test":
        raise HTTPException(409, "Use the labelled simulation for this test order; Pesapal is not called.")
    profile = account(order.account_id)
    if profile["environment"] != order.environment or commerce.digest(profile["consumer_key"]) != order.account_fingerprint:
        raise HTTPException(409, "The original payment account must be retained for this order.")
    # Commit ownership of the non-idempotent provider call before sending it.
    claim = db.execute(update(AppOrder).where(AppOrder.id == order.id, AppOrder.payment_state == "not_started")
                       .values(payment_state="creating"))
    db.commit()
    db.refresh(order)
    if claim.rowcount != 1:
        return commerce.order_view(order)
    provider = Provider(order.account_id)
    submitted = False
    try:
        notification = await provider.notification_id()
        billing = order.snapshot["checkout"]["billing"]
        submitted = True
        result = await provider.call("POST", "/Transactions/SubmitOrderRequest", {
            "id": order.reference, "currency": "KES", "amount": order.total_minor/100,
            "description": f"Cake City app {order.reference}"[:100],
            "callback_url": public_url() + PREFIX + "/return", "cancellation_url": public_url() + PREFIX + "/return",
            "notification_id": notification, "billing_address": {"email_address": billing["email"],
                "phone_number": billing["phone"], "country_code": "KE", "first_name": billing["first_name"],
                "last_name": billing["last_name"], "line_1": billing["address"], "city": billing["city"]}})
        tracking = str(UUID(result["order_tracking_id"]))
        link = urlsplit(result["redirect_url"])
        host = "pay.pesapal.com" if order.environment == "live" else "cybqa.pesapal.com"
        if result.get("merchant_reference") != order.reference or link.scheme != "https" or link.hostname != host or link.username or link.password or link.port not in (None, 443):
            raise ValueError()
        db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
        db.refresh(order)
        if order.tracking_id and order.tracking_id != tracking:
            raise ValueError()
        order.tracking_id, order.payment_url = tracking, result["redirect_url"]
        if order.payment_state == "creating":
            order.payment_state = "pending"
        commerce.record_event(db, order, "payment_requested", account_id=order.account_id, tracking_id=tracking)
        db.commit()
    except (HTTPException, ValueError, KeyError, TypeError):
        db.rollback()
        db.refresh(order)
        if order.payment_state == "creating":
            order.payment_state = "uncertain" if submitted else "not_started"
        commerce.issue(db, order.reference, "payment_submission_uncertain" if submitted else "payment_setup_failed")
        db.commit()
        raise HTTPException(502, f"Payment for {order.reference} needs confirmation. Check this app order before paying again.") from None
    return commerce.order_view(order)


def paid_amount(value):
    try:
        amount = Decimal(str(value))*100
        if not amount.is_finite() or amount != amount.to_integral_value() or amount <= 0:
            raise ValueError()
        return int(amount)
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(409, "Payment amount could not be verified.") from None


async def reconcile(db, order, tracking_id):
    if order.channel == "app_test":
        raise HTTPException(409, "Simulated test orders do not have Pesapal transactions.")
    # A same-row write serializes workers on PostgreSQL and SQLite.
    db.execute(update(AppOrder).where(AppOrder.id == order.id).values(reference=order.reference))
    db.refresh(order)
    if order.tracking_id and order.tracking_id != tracking_id:
        raise HTTPException(409, "Payment tracking does not match this app order.")
    profile = account(order.account_id)
    if profile["environment"] != order.environment or commerce.digest(profile["consumer_key"]) != order.account_fingerprint:
        raise HTTPException(409, "The original payment profile is required to verify this order.")
    result = await Provider(order.account_id).call("GET", "/Transactions/GetTransactionStatus", params={"orderTrackingId": tracking_id})
    if result.get("merchant_reference") != order.reference:
        raise HTTPException(409, "Payment reference does not match this app order.")
    state = {"1": "completed", "2": "failed", "3": "reversed"}.get(str(result.get("status_code")), "pending")
    if state != "pending" and (result.get("currency") != "KES" or paid_amount(result.get("amount")) != order.total_minor):
        commerce.issue(db, order.reference, "payment_amount_mismatch")
        db.commit()
        raise HTTPException(409, "Payment amount or currency differs from the app order. Staff review is required.")
    if order.payment_state == "reversed" or (order.payment_state == "completed" and state in ("pending", "failed")):
        db.commit()
        return order
    order.tracking_id = tracking_id
    previous = order.payment_state
    if state == "completed":
        if order.inventory_state == "released":
            order.state = "review_required"
            commerce.issue(db, order.reference, "late_payment_after_release")
        else:
            commerce.inventory_transition(db, order, paid=True)
            if previous != "completed":
                order.state = "paid"
        order.paid_at = order.paid_at or datetime.now(UTC)
        commerce.sale(db, order)
    elif state == "failed":
        commerce.inventory_transition(db, order, paid=False)
        order.state = "payment_failed"
    elif state == "reversed":
        order.paid_at = order.paid_at or datetime.now(UTC)
        commerce.inventory_transition(db, order, paid=False)
        commerce.sale(db, order, reversed=True)
        commerce.issue(db, order.reference, "payment_reversed")
        order.state = "review_required"
    order.payment_state = state
    if previous != state:
        commerce.record_event(db, order, "payment_" + state, account_id=order.account_id, tracking_id=tracking_id)
    db.flush()
    # App Club uses app order references and confirmed app-only spend.
    if order.paid_at and state in ("completed", "reversed") and order.channel != "app_test":
        from .routes_club import OrderEvent, apply_order_event
        goods = order.subtotal_minor-order.discount_minor
        apply_order_event(OrderEvent(event_id=f"app-{order.reference}-{state}", order_id=order.reference,
            customer_id=order.customer_id, paid_minor=goods, refunded_minor=goods if state == "reversed" else 0), db)
    db.commit()
    return order


@router.post(PREFIX + "/orders/{reference}/verify")
async def verify(reference: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    order = owned(db, reference, customer.id)
    if not order.tracking_id:
        return commerce.order_view(order)
    return commerce.order_view(await reconcile(db, order, order.tracking_id))


@router.get(PREFIX + "/ipn")
async def ipn(OrderTrackingId: UUID, OrderMerchantReference: str = Query(max_length=50),
              OrderNotificationType: str = Query(default="IPNCHANGE", max_length=40), db: Session = Depends(get_db)):
    order = db.scalar(select(AppOrder).where(AppOrder.reference == OrderMerchantReference))
    if not order:
        raise HTTPException(404, "Unknown app payment reference.")
    await reconcile(db, order, str(OrderTrackingId))
    return {"orderNotificationType": OrderNotificationType, "orderTrackingId": str(OrderTrackingId),
            "orderMerchantReference": OrderMerchantReference, "status": 200}


@router.get(PREFIX + "/return", response_class=HTMLResponse)
def payment_return():
    # WebView intercepts this URL; query parameters never authorize payment.
    return HTMLResponse("<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'>"
                        "<title>Cake City app payment</title><body><p>Checking your app payment securely.</p>"
                        "<script>if(window.parent!==window)window.parent.postMessage('cakecity-payment-return','*');</script></body></html>")
