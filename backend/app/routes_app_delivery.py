from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from pathlib import Path
import json
from urllib.parse import quote

from . import app_delivery as delivery
from .commerce_models import AppPolicy
from .config import get_settings
from .db import get_db
from .models import Customer
from .permissions import audit
from .routes_app_admin import operator
from .routes_club import member

router = APIRouter(tags=["app-delivery"])


@router.post("/v1/admin/app-delivery/payment-check")
async def payment_check(_: Customer = Depends(operator)):
    from .pesapal import Provider, account, configured, public_url
    if not configured():
        raise HTTPException(503, "Configure the Pesapal merchant keys and HTTPS callback URL on Render.")
    notification_id = await Provider(get_settings().pesapal_account_id).notification_id()
    return {"status": "ready", "environment": account()["environment"], "notification_registered": bool(notification_id),
            "callback_origin": public_url(), "charged": False}


@router.get("/v1/admin/app-delivery")
def settings(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    return {**delivery.policy(db).model_dump(mode="json"), "base_minor": 10000, "per_km_minor": 3000,
            "transfer_percent": 50, "source": delivery.SOURCE,
            "maps_ready": bool(get_settings().google_maps_api_key),
            "map_picker_ready": bool(get_settings().google_maps_browser_key)}


@router.put("/v1/admin/app-delivery")
def save(data: delivery.DeliveryPolicy, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    row = db.get(AppPolicy, "delivery")
    if row is None:
        row = AppPolicy(id="delivery", payload={})
        db.add(row)
    row.payload = data.model_dump(mode="json")
    audit(db, actor.id, "app_delivery_policy", "hq", enabled=data.enabled)
    db.commit()
    return {"status": "saved"}


class Search(BaseModel):
    address: str = Field(min_length=3, max_length=300)


@router.post("/v1/app-delivery/search")
async def search(data: Search, _: Customer = Depends(member)):
    return {"results": await delivery.geocode(address=data.address)}


@router.post("/v1/app-delivery/resolve")
async def resolve(data: delivery.Point, _: Customer = Depends(member)):
    return {"results": await delivery.geocode(point=data)}


class RouteQuote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fulfilment: str = Field(pattern="^(delivery|pickup)$")
    destination: delivery.Point | None = None
    pickup_location_id: str | None = Field(default=None, max_length=60)


@router.post("/v1/app-delivery/quote")
async def route_quote(data: RouteQuote, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return await delivery.create_quote(db, customer.id, data.fulfilment, data.destination, data.pickup_location_id)


@router.get("/v1/app-delivery/map", response_class=HTMLResponse)
def map_picker(db: Session = Depends(get_db)):
    key = get_settings().google_maps_browser_key
    config = delivery.policy(db)
    if not key or not config.origin:
        raise HTTPException(503, "Map picker is awaiting configuration. Search for your destination or use current location.")
    payload = {"origin": config.origin.model_dump(), "radius_km": config.radius_km}
    page = (Path(__file__).parent / "dashboard" / "delivery-map.html").read_text(encoding="utf-8")
    page = page.replace("__CONFIG__", json.dumps(payload).replace("<", "\\u003c"))
    page = page.replace("__MAP_KEY__", quote(key, safe=""))
    return HTMLResponse(page, headers={"Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin"})
