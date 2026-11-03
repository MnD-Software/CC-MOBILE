"""HQ dispatch, server-owned road quotes and delivery boundaries for the app."""
import hashlib
import json
import math
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from pathlib import Path

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .commerce_models import AppDeliveryQuote, AppPolicy
from .config import get_settings

SOURCE = "Cakecity Order and Requisition Fullfilment.pptx, slide 1"
DEFAULT_ADDRESS = "Cake City Call Centre, Soliton Academy, Wambugu Road, Nairobi, Kenya"


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PickupStore(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(pattern=r"^[a-z0-9-]{1,60}$")
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def pin_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both branch coordinates or use its address for Maps lookup.")
        return self


class DeliveryPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    enabled: bool = False
    origin_name: str = Field(default="Cake City HQ", min_length=1, max_length=120)
    origin_address: str = Field(default=DEFAULT_ADDRESS, min_length=1, max_length=300)
    origin: Point | None = None
    radius_km: float | None = Field(default=None, gt=0, le=500)
    pickup_stores: list[PickupStore] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def configured(self):
        if self.enabled and (self.origin is None or self.radius_km is None):
            raise ValueError("Confirm the HQ pin and delivery radius before enabling distance delivery.")
        identities = [s.id for s in self.pickup_stores]
        if "hq" in identities or len(identities) != len(set(identities)):
            raise ValueError("Pickup store IDs must be unique and must not use hq.")
        return self


def policy(db):
    row = db.get(AppPolicy, "delivery")
    if row:
        return DeliveryPolicy.model_validate(row.payload)
    directory = json.loads((Path(__file__).parent / "data" / "pickup_stores.json").read_text(encoding="utf-8"))
    return DeliveryPolicy(pickup_stores=directory["stores"])


def fingerprint(value):
    return hashlib.sha256(json.dumps(value.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()


def distance_km(a, b):
    rad = math.pi / 180
    term = math.sin((b.latitude-a.latitude)*rad/2)**2 + math.cos(a.latitude*rad)*math.cos(b.latitude*rad)*math.sin((b.longitude-a.longitude)*rad/2)**2
    return 6371 * 2 * math.asin(math.sqrt(min(1, term)))


def delivery_fee(distance_meters, *, transfer=False):
    # KES 100 base + KES 30/km. Whole route metres are billed to KES cents.
    fee = 10000 + distance_meters * 3
    return (fee + 1)//2 if transfer else fee


async def google_request(method, url, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (httpx.HTTPError, ValueError):
        # Provider exceptions may contain API keys or precise coordinates.
        raise HTTPException(503, "Maps is temporarily unavailable. Try again or choose HQ pickup.") from None


def server_key():
    value = get_settings().google_maps_api_key
    if not value:
        raise HTTPException(503, "Distance delivery is awaiting Maps setup. HQ pickup is separate.")
    return value


async def geocode(address=None, point=None):
    params = {"key": server_key(), "region": "ke"}
    if point:
        params["latlng"] = f"{point.latitude},{point.longitude}"
    else:
        params.update(address=address, components="country:KE")
    result = await google_request("GET", "https://maps.googleapis.com/maps/api/geocode/json", params=params)
    if result.get("status") == "ZERO_RESULTS":
        return []
    if result.get("status") != "OK":
        raise HTTPException(503, "Location search is unavailable. Check Maps configuration.")
    found = []
    for item in result.get("results", [])[:5]:
        try:
            value = Point(latitude=item["geometry"]["location"]["lat"], longitude=item["geometry"]["location"]["lng"])
            found.append({**value.model_dump(), "address": str(item["formatted_address"])[:500]})
        except (KeyError, TypeError, ValueError):
            continue
    return found


async def road_distance(origin, destination):
    result = await google_request("POST", "https://routes.googleapis.com/directions/v2:computeRoutes",
        headers={"X-Goog-Api-Key": server_key(), "X-Goog-FieldMask": "routes.distanceMeters"},
        json={"origin": {"location": {"latLng": origin.model_dump()}},
              "destination": {"location": {"latLng": destination.model_dump()}},
              "travelMode": "DRIVE", "routingPreference": "TRAFFIC_UNAWARE", "units": "METRIC"})
    try:
        meters = result["routes"][0]["distanceMeters"]
        if type(meters) is not int or not 0 <= meters <= 1_000_000:
            raise ValueError()
        return meters
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(409, "No supported road route was found for this destination.") from None


async def destination_for(config, fulfilment, point, pickup_id):
    if not config.enabled or config.origin is None:
        raise HTTPException(503, "HQ distance delivery is not enabled yet.")
    if fulfilment == "pickup":
        if pickup_id == "hq":
            return config.origin, config.origin_name, config.origin_address
        store = next((s for s in config.pickup_stores if s.id == pickup_id), None)
        if not store:
            raise HTTPException(422, "Select a configured pickup store.")
        if store.latitude is not None:
            destination = Point(latitude=store.latitude, longitude=store.longitude)
        else:
            matches = await geocode(address=store.address)
            if len(matches) != 1:
                raise HTTPException(409, "This branch pin needs staff confirmation. Choose another branch or HQ pickup.")
            destination = Point(latitude=matches[0]["latitude"], longitude=matches[0]["longitude"])
        return destination, store.name, store.address
    if point is None:
        raise HTTPException(422, "Choose and confirm your delivery pin.")
    if distance_km(config.origin, point) > config.radius_km:
        raise HTTPException(409, "This destination is outside the HQ delivery area. Choose HQ pickup or another destination.")
    return point, "Doorstep delivery", ""


async def create_quote(db, customer_id, fulfilment, point=None, pickup_id=None):
    config = policy(db)
    destination, name, address = await destination_for(config, fulfilment, point, pickup_id)
    hq_pickup = fulfilment == "pickup" and pickup_id == "hq"
    meters = 0 if hq_pickup else await road_distance(config.origin, destination)
    now = datetime.now(UTC)
    snapshot = {"policy_digest": fingerprint(config), "source": SOURCE, "fulfilment": fulfilment,
        "origin": config.origin.model_dump(), "origin_name": config.origin_name, "origin_address": config.origin_address,
        "destination": destination.model_dump(), "destination_name": name, "destination_address": address,
        "pickup_location_id": pickup_id if fulfilment == "pickup" else None, "distance_meters": meters,
        "fee_minor": 0 if hq_pickup else delivery_fee(meters, transfer=fulfilment == "pickup"),
        "rate": "Free HQ pickup" if hq_pickup else "50% of KES 100 + KES 30/km" if fulfilment == "pickup" else "KES 100 + KES 30/km",
        "quoted_at": now.isoformat()}
    expires = now+timedelta(minutes=15)
    row = AppDeliveryQuote(id=str(uuid4()), customer_id=customer_id, snapshot=snapshot, expires_at=expires)
    db.add(row)
    db.commit()
    return {"id": row.id, **snapshot, "expires_at": expires.isoformat()}


def checked_quote(db, customer_id, identity, fulfilment):
    row = db.get(AppDeliveryQuote, identity) if identity else None
    expires = row.expires_at.replace(tzinfo=UTC) if row and row.expires_at.tzinfo is None else row.expires_at if row else None
    if not row or row.customer_id != customer_id or expires <= datetime.now(UTC):
        raise HTTPException(409, "Confirm a current delivery or pickup quote before payment.")
    if row.snapshot["fulfilment"] != fulfilment or row.snapshot["policy_digest"] != fingerprint(policy(db)):
        raise HTTPException(409, "Delivery rules changed. Confirm your destination and quote again.")
    return row.snapshot
