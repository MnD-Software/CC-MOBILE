"""Order ownership is proven with a private receipt key, never email alone."""
import base64
import hashlib
import hmac
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Customer, WooOrderLink
from .routes_club import OrderEvent, account, apply_order_event, member

router = APIRouter(tags=["club-integrations"])


async def verified_order(order_id):
    settings = get_settings()
    if not settings.woocommerce_consumer_key or not settings.woocommerce_consumer_secret:
        raise HTTPException(503, "Verified Club order linking is not configured")
    try:
        async with httpx.AsyncClient(timeout=15, auth=(settings.woocommerce_consumer_key, settings.woocommerce_consumer_secret)) as client:
            response = await client.get(f"{settings.woocommerce_api_url}/orders/{order_id}")
            response.raise_for_status()
            order = response.json()
            response = await client.get(f"{settings.woocommerce_api_url}/orders/{order_id}/refunds", params={"per_page": 100})
            response.raise_for_status()
            refunds = response.json()
            if not isinstance(refunds, list) or len(refunds) >= 100:
                raise ValueError("Refund reconciliation required")
            if not isinstance(order, dict) or str(order["id"]) != str(order_id):
                raise ValueError("Invalid order")
            return order, refunds
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(502, "Cake City could not verify this order") from None


def qualifying_minor(lines, refund=False):
    try:
        total = Decimal(0)
        for line in lines:
            amount = Decimal(str(line["total"]))
            if not amount.is_finite() or (amount > 0 if refund else amount < 0):
                raise ValueError("Invalid line total")
            total += -amount if refund else amount
        minor = total*100
        if minor != minor.to_integral_value() or minor > 1000000000:
            raise ValueError("Invalid money precision")
        return int(minor)
    except (InvalidOperation, KeyError, TypeError, ValueError):
        raise HTTPException(502, "Order amounts require reconciliation") from None


def sync_order(order, refunds, customer_id, db):
    if order.get("currency") != "KES":
        raise HTTPException(409, "Club supports KES purchases")
    if not order.get("date_paid") or order.get("status") not in ("processing", "completed", "refunded", "cancelled", "canceled", "failed"):
        return {"status": "pending_payment"}
    paid = qualifying_minor(order.get("line_items", []))
    refunded = sum(qualifying_minor(refund.get("line_items", []), refund=True) for refund in refunds)
    # WooCommerce manual refunds without item allocations cannot safely decide
    # qualifying spend. Defer to staff instead of over-crediting the customer.
    if any(Decimal(str(refund.get("amount", "0"))) > 0 and not refund.get("line_items") for refund in refunds):
        value = account(db, customer_id)
        value.review_required = True
        db.commit()
        raise HTTPException(409, "This refund needs staff reconciliation; redemption is paused")
    if order.get("status") in ("cancelled", "canceled", "failed"):
        refunded = paid
    fingerprint = hashlib.sha256(f"{order['id']}:{paid}:{refunded}".encode()).hexdigest()
    event = OrderEvent(event_id=f"woo-{fingerprint}", order_id=str(order["id"]), customer_id=customer_id, paid_minor=paid, refunded_minor=refunded)
    result = apply_order_event(event, db)
    from .routes_club_benefits import sync_referral
    sync_referral(customer_id, str(order["id"]), order.get("status"), db)
    return result


class LinkOrder(BaseModel):
    order_id: int = Field(gt=0)
    order_key: str = Field(min_length=8, max_length=120)
    billing_email: EmailStr


@router.post("/v1/club/orders/link")
async def link_order(data: LinkOrder, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    order, refunds = await verified_order(data.order_id)
    if not hmac.compare_digest(str(order.get("order_key", "")), data.order_key) or str(order.get("billing", {}).get("email", "")).lower() != str(data.billing_email).lower():
        raise HTTPException(403, "Receipt could not be verified")
    account(db, customer.id)
    link = db.get(WooOrderLink, str(data.order_id))
    if link and link.customer_id != customer.id:
        raise HTTPException(409, "This order is already linked to a member")
    if not link:
        db.add(WooOrderLink(order_id=str(data.order_id), customer_id=customer.id))
        db.flush()
    result = sync_order(order, refunds, customer.id, db)
    db.commit()
    return result


@router.post("/v1/integrations/woocommerce/order-updated")
async def woo_event(request: Request, x_wc_webhook_signature: str = Header(default=""), db: Session = Depends(get_db)):
    secret = get_settings().woocommerce_webhook_secret
    if not secret:
        raise HTTPException(503, "WooCommerce webhook verification is not configured")
    raw = await request.body()
    if len(raw) > 1048576:
        raise HTTPException(413, "Webhook too large")
    expected = base64.b64encode(hmac.new(secret.encode(), raw, hashlib.sha256).digest()).decode()
    if not hmac.compare_digest(expected, x_wc_webhook_signature):
        raise HTTPException(401, "Invalid webhook signature")
    import json
    try:
        payload = json.loads(raw)
        identity = str(int(payload["id"]))
    except (ValueError, TypeError, KeyError):
        raise HTTPException(422, "Invalid order webhook") from None
    link = db.get(WooOrderLink, identity)
    if not link:
        return {"status": "unlinked"}
    order, refunds = await verified_order(identity)
    return sync_order(order, refunds, link.customer_id, db)
