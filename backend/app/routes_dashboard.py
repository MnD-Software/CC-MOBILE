"""Same-origin staff dashboard and app-owned catalogue/promotion management."""
from datetime import UTC, datetime
from pathlib import Path
from secrets import randbelow
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .app_commerce import digest, utc
from .commerce_models import AppCoupon, AppProduct
from .db import get_db
from .models import Customer
from .permissions import audit
from .routes_app_admin import operator

router = APIRouter(tags=["web-dashboard"])
STATIC = Path(__file__).parent / "dashboard"


@router.get("/admin", include_in_schema=False)
@router.get("/admin/", include_in_schema=False)
def dashboard():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"})


@router.get("/admin/assets/{name}", include_in_schema=False)
def dashboard_asset(name: str):
    if name not in ("dashboard.js", "dashboard.css", "workspace.js"):
        raise HTTPException(404)
    return FileResponse(STATIC / name, headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})


def product_view(row):
    return {"id": row.id, "slug": row.slug, "parent_id": row.parent_id, "payload": row.payload,
            "price_minor": row.price_minor, "allocation": row.allocation, "reserved": row.reserved,
            "sold": row.sold, "enabled": row.enabled, "revision": row.revision,
            "order_mode": row.payload.get("order_mode", "stocked")}


@router.get("/v1/admin/dashboard/products")
def products(search: str = Query(default="", max_length=160), page: int = Query(default=1, ge=1),
             per_page: int = Query(default=30, ge=1, le=100), state: str = "all",
             _: Customer = Depends(operator), db: Session = Depends(get_db)):
    query = select(AppProduct)
    if search.strip():
        term = "%" + search.strip().lower().replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(or_(func.lower(AppProduct.slug).like(term, escape="\\"),
                               func.lower(AppProduct.payload["name"].as_string()).like(term, escape="\\"),
                               AppProduct.id == (int(search) if search.isdigit() else -1)))
    if state in ("enabled", "disabled"):
        query = query.where(AppProduct.enabled.is_(state == "enabled"))
    elif state == "variations":
        query = query.where(AppProduct.parent_id.is_not(None))
    elif state != "all":
        raise HTTPException(422, "Unknown product filter")
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    return {"items": [product_view(r) for r in db.scalars(query.order_by(AppProduct.id).offset((page-1)*per_page).limit(per_page))],
            "total": total, "page": page, "pages": max(1, (total+per_page-1)//per_page)}


class CategoryInput(BaseModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)


class ProductInput(BaseModel):
    revision: int = Field(default=0, ge=0)
    name: str = Field(min_length=1, max_length=240)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=240)
    description: str = Field(default="", max_length=20000)
    short_description: str = Field(default="", max_length=2000)
    price_minor: int = Field(ge=1, le=1000000000)
    allocation: int = Field(ge=0, le=1000000)
    enabled: bool = False
    order_mode: Literal["made_to_order", "stocked"] = "made_to_order"
    image_urls: list[str] = Field(default_factory=list, max_length=12)
    categories: list[CategoryInput] = Field(default_factory=list, max_length=20)
    parent_id: int | None = Field(default=None, gt=0)

    @field_validator("image_urls")
    @classmethod
    def images(cls, values):
        from .routes_content import media_url
        for value in values:
            if len(value) > 3000 or not value:
                raise ValueError("Invalid image URL")
            if not value.startswith("/v1/app-media/"):
                media_url(value)
            if urlsplit(value).hostname in ("cakecity.co.ke", "www.cakecity.co.ke", "i0.wp.com", "i1.wp.com", "i2.wp.com"):
                raise ValueError("Upload this image to the app before saving")
        return values


def save_product(identity, data, actor, db):
    row = db.get(AppProduct, identity) if identity else None
    if row and row.payload.get("odoo_source"):
        raise HTTPException(409, "Odoo manages this product. Change it in Odoo and synchronize the app.")
    if identity and not row:
        raise HTTPException(404, "Product not found")
    if (row and row.parent_id != data.parent_id) or (not row and data.revision):
        raise HTTPException(409, "Product identity changed. Reload before saving.")
    if not row and data.parent_id:
        raise HTTPException(422, "Create simple products here. Edit existing imported variations through their own records.")
    if data.parent_id:
        parent = db.get(AppProduct, data.parent_id)
        if not parent or parent.payload.get("type") != "variable":
            raise HTTPException(422, "Select an existing variable parent product")
    payload = dict(row.payload) if row else {"type": "variation" if data.parent_id else "simple", "attributes": [], "variation_attributes": []}
    identity = identity or 1_000_000_000 + randbelow(1_000_000_000)
    payload.update(id=identity, slug=data.slug, name=data.name, description=data.description, order_mode=data.order_mode,
                   short_description=data.short_description, categories=[c.model_dump() for c in data.categories],
                   images=[{"id": i+1, "src": u, "name": data.name, "alt": data.name, "thumbnail": u} for i, u in enumerate(data.image_urls)])
    payload["prices"] = {**payload.get("prices", {}), "price": str(data.price_minor),
                         "regular_price": str(data.price_minor), "currency_code": "KES", "currency_minor_unit": 2}
    if not row:
        row = AppProduct(id=identity, slug=data.slug, parent_id=data.parent_id, payload=payload,
                         price_minor=data.price_minor, allocation=data.allocation, enabled=data.enabled)
        db.add(row)
    else:
        changed = db.execute(update(AppProduct).where(AppProduct.id == identity, AppProduct.revision == data.revision,
            AppProduct.reserved + AppProduct.sold <= data.allocation).values(payload=payload, slug=data.slug,
            price_minor=data.price_minor, allocation=data.allocation, enabled=data.enabled, revision=AppProduct.revision+1))
        if changed.rowcount != 1:
            raise HTTPException(409, "Product changed or allocation is below reserved plus sold stock. Reload before saving.")
    audit(db, actor.id, "dashboard.product.saved", str(identity), enabled=data.enabled)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This slug or product identity is already in use") from None
    from .catalogue import catalogue
    catalogue.cache.clear()
    db.refresh(row)
    return product_view(row)


@router.post("/v1/admin/dashboard/products", status_code=201)
def create_product(data: ProductInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    return save_product(None, data, actor, db)


@router.put("/v1/admin/dashboard/products/{identity}")
def edit_product(identity: int, data: ProductInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    return save_product(identity, data, actor, db)


def coupon_view(row):
    config = {"code": row.code, "amount_minor": row.amount_minor, "minimum_minor": row.minimum_minor,
              "usage_limit": row.usage_limit, "enabled": row.enabled,
              "expires_at": utc(row.expires_at).isoformat() if row.expires_at else None}
    return {**config, "version": digest(config), "uses": row.uses, "reserved": row.reserved,
            "customer_id": row.customer_id}


class PromotionInput(BaseModel):
    version: str = Field(default="", max_length=64)
    amount_minor: int = Field(ge=1, le=1000000000)
    minimum_minor: int = Field(default=0, ge=0, le=1000000000)
    usage_limit: int = Field(ge=1, le=1000000)
    enabled: bool
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def timestamp(cls, value):
        if value and not value.tzinfo:
            raise ValueError("Expiry must include a timezone")
        return value


@router.get("/v1/admin/dashboard/promotions")
def promotions(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    return [coupon_view(r) for r in db.scalars(select(AppCoupon).order_by(AppCoupon.code))]


@router.put("/v1/admin/dashboard/promotions/{code}")
def promotion(code: str, data: PromotionInput, actor: Customer = Depends(operator), db: Session = Depends(get_db)):
    import re
    code = code.strip().casefold()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,79}", code):
        raise HTTPException(422, "Use a code of 3 to 80 letters, numbers, hyphens or underscores")
    row = db.scalar(select(AppCoupon).where(AppCoupon.code == code).with_for_update())
    if row and row.customer_id:
        raise HTTPException(409, "Member reward coupons cannot be edited as general promotions")
    if (row and coupon_view(row)["version"] != data.version) or (not row and data.version):
        raise HTTPException(409, "Promotion changed. Reload before saving.")
    if row and data.usage_limit < row.uses + row.reserved:
        raise HTTPException(409, "Usage limit cannot erase redeemed or reserved uses")
    if not row:
        row = AppCoupon(code=code)
        db.add(row)
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(row, key, value)
    audit(db, actor.id, "dashboard.promotion.saved", code, enabled=data.enabled)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Promotion changed. Reload before saving.") from None
    db.refresh(row)
    return coupon_view(row)


@router.get("/v1/admin/dashboard/club")
async def club_members(_: Customer = Depends(operator), db: Session = Depends(get_db)):
    from .odoo_loyalty import authoritative
    if authoritative():
        from .odoo_client import OdooClient
        return await OdooClient().bridge("club_members")
    from .models import ClubAccount, ClubOrder
    counts = select(ClubOrder.customer_id, func.count().label("purchases")).group_by(ClubOrder.customer_id).subquery()
    rows = db.execute(select(Customer, ClubAccount, counts.c.purchases)
        .outerjoin(ClubAccount, ClubAccount.customer_id == Customer.id)
        .outerjoin(counts, counts.c.customer_id == Customer.id).order_by(Customer.created_at.desc()).limit(500)).all()
    return [{"id": c.id, "name": " ".join(filter(None, [c.first_name, c.last_name])), "email": c.email,
        "points": a.points if a else 0, "spend_minor": a.spend_minor if a else 0,
        "review_required": a.review_required if a else False, "purchases": n or 0} for c, a, n in rows]
