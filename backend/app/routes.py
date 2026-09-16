from fastapi import APIRouter, HTTPException, Query
import httpx

from .config import get_settings
from .schemas import MobileConfigResponse

router = APIRouter(tags=["platform"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cakecity-api"}


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
        },
        branches=[],
        campaigns=[],
        studio=None,
    )


@router.get("/v1/catalogue/products")
async def catalogue_products(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=24, ge=1, le=100),
    search: str | None = None,
):
    params: dict[str, str | int] = {"page": page, "per_page": per_page}
    if search:
        params["search"] = search
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(get_settings().woocommerce_store_url + "/products", params=params)
            response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as error:
        raise HTTPException(status_code=502, detail="Catalogue service unavailable") from error
    return response.json()
