from fastapi import APIRouter, HTTPException, Query, Depends, Response, Header
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from .db import get_db
from .models import PairingRule, Customer
from .routes_enquiries import staff
import httpx

from .config import get_settings
from .catalogue import catalogue
from .schemas import MobileConfigResponse

router = APIRouter(tags=["platform"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cakecity-api", "release": "editorial-2026-10-10"}


@router.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "service": "cakecity-api"}


@router.get("/v1/mobile/config", response_model=MobileConfigResponse)
def mobile_config() -> MobileConfigResponse:
    return MobileConfigResponse(
        checkout_contract="cakecity-mobile-v1",
        capabilities={
            "distance_delivery": False,
            "studio": False,
            "coupons": False,
            "native_push": False,
            "variation_checkout": False,
            "club": True,
            "celebrations": True,
            "pairings": True,
        },
        branches=[],
        campaigns=[],
        studio=None,
    )


@router.get("/v1/catalogue/products")
async def catalogue_products(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=24, ge=1, le=100),
    category: int | None = Query(default=None, ge=1),
    search: str | None = Query(default=None, max_length=120),
    accept_encoding: str = Header(default=""),
):
    params: dict[str, str | int] = {"page": page, "per_page": per_page}
    if category is not None:
        params["category"] = category
    if search:
        params["search"] = search
    try:
        compressed = any(part.strip().lower() == "gzip" for part in accept_encoding.split(","))
        headers = {"Cache-Control": "public, max-age=30, stale-while-revalidate=240", "Vary": "Accept-Encoding"}
        if compressed:
            headers["Content-Encoding"] = "gzip"
        return Response(content=await catalogue.response_bytes(params, compressed), media_type="application/json", headers=headers)
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Catalogue service unavailable") from error


@router.get("/v1/catalogue/products/{product_id}/pairings")
async def product_pairings(product_id: int, db: Session = Depends(get_db)):
    if product_id < 1:
        raise HTTPException(422, "Invalid product")
    try:
        # Shared cached candidate searches across all product pages, rather than
        # a new group of upstream requests for each individual product.
        import asyncio
        curated = list(db.scalars(select(PairingRule.target_id).where(PairingRule.product_id == product_id).order_by(PairingRule.priority)))
        requests = [catalogue.products({"search": term, "per_page": 30}) for term in ("cupcake", "candle", "topper", "cake")]
        if curated:
            requests.insert(0, catalogue.products({"include": ",".join(map(str, curated)), "per_page": 20}))
        results = await asyncio.gather(*requests, return_exceptions=True)
        successful = [result for result in results if isinstance(result, list)]
        if not successful:
            raise HTTPException(502, "Pairings temporarily unavailable")
        seen = set()
        products = []
        for result in successful:
            for item in result:
                identity = item.get("id")
                if identity == product_id or identity in seen:
                    continue
                if not item.get("is_in_stock") or not item.get("is_purchasable"):
                    continue
                seen.add(identity)
                products.append(item)
        return {"products": products, "curated_ids": curated}
    except httpx.HTTPError as error:
        raise HTTPException(502, "Pairings temporarily unavailable") from error


class PairingInput(BaseModel):
    product_ids: list[int] = Field(max_length=20)


@router.put("/v1/admin/catalogue/pairings/{product_id}")
def curate_pairings(product_id: int, data: PairingInput, _: Customer = Depends(staff), db: Session = Depends(get_db)):
    if product_id < 1 or any(identity < 1 or identity == product_id for identity in data.product_ids):
        raise HTTPException(422, "Pairings must reference other positive product IDs")
    if len(set(data.product_ids)) != len(data.product_ids):
        raise HTTPException(422, "Duplicate pairings are not allowed")
    db.execute(delete(PairingRule).where(PairingRule.product_id == product_id))
    for priority, identity in enumerate(data.product_ids):
        db.add(PairingRule(product_id=product_id, target_id=identity, priority=priority))
    db.commit()
    return {"product_id": product_id, "product_ids": data.product_ids}
