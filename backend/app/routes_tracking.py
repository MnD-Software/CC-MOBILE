"""Read-only tracking for app members holding a private WooCommerce receipt."""
import hmac
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .config import get_settings
from .models import Customer
from .routes_club import member

router = APIRouter(tags=["order-tracking"])


class ReceiptAccess(BaseModel):
    order_id: int = Field(gt=0)
    order_key: str = Field(pattern=r"^wc_order_[A-Za-z0-9_-]{4,128}$")
    billing_email: EmailStr


async def read_order(order_id: int):
    settings = get_settings()
    if not settings.woocommerce_consumer_key or not settings.woocommerce_consumer_secret:
        raise HTTPException(503, "Order tracking is not connected. Please contact Cake City.")
    try:
        async with httpx.AsyncClient(timeout=20, auth=(settings.woocommerce_consumer_key, settings.woocommerce_consumer_secret)) as client:
            response = await client.get(f"{settings.woocommerce_api_url}/orders/{order_id}")
            if response.status_code == 404:
                raise HTTPException(403, "Check your receipt link and billing email.")
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Cake City could not retrieve this order. Please retry.") from None


@router.post("/v1/orders/track")
async def track_order(data: ReceiptAccess, customer: Customer = Depends(member)):
    order = await read_order(data.order_id)
    try:
        if not isinstance(order, dict) or order.get("id") != data.order_id:
            raise ValueError("Invalid order response")
        # Both proofs are required. Never return billing, shipping or payment data.
        if not hmac.compare_digest(str(order.get("order_key", "")), data.order_key) or str(order.get("billing", {}).get("email", "")).strip().casefold() != str(data.billing_email).casefold():
            raise HTTPException(403, "Check your receipt link and billing email.")
        # WooCommerce currency amounts are decimal major units, not floats.
        currency = str(order["currency"])
        # Cake City only sells in KES; reject unsupported precision explicitly.
        if currency != "KES":
            raise ValueError("Unsupported currency")
        total = Decimal(str(order["total"])) * 100
        if not total.is_finite() or total < 0 or total != total.to_integral_value():
            raise ValueError("Invalid total")
        return {
            "id": order["id"], "status": order["status"],
            "items": [{"id": line["id"], "name": line["name"], "quantity": line["quantity"]} for line in order["line_items"]],
            "coupons": [],
            "totals": {"total_price": str(int(total)), "currency_code": currency, "currency_minor_unit": 2},
        }
    except (httpx.HTTPError, ValueError, KeyError, TypeError, InvalidOperation):
        raise HTTPException(502, "Cake City could not retrieve this order. Please retry.") from None
