"""Persistent app catalogue and media; browsing performs zero website HTTP calls."""
from urllib.parse import urlsplit
from html import unescape
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .commerce_models import AppMedia, AppPage, AppProduct
from .config import get_settings
from .db import get_db

router = APIRouter(tags=["independent-catalogue"])


def search_text(value):
    value = re.sub(r"([a-z])([A-Z])", r"\1 \2", str(value))
    value = unicodedata.normalize("NFKD", unescape(value)).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", value))


def search_matches(row, query):
    name = search_text(row.payload.get("name", ""))
    slug = search_text(row.slug)
    categories = " ".join(search_text(c.get("name", "")) for c in row.payload.get("categories", []))
    attributes = " ".join(search_text(option) for attribute in row.payload.get("attributes", []) for option in attribute.get("options", []))
    haystack = f"{name} {slug} {categories} {attributes}"
    words = search_text(query).split()
    # Search each word rather than requiring an adjacent phrase. Cake/cakes
    # and names typed without spaces retain the same published catalogue.
    return bool(words) and all(
        (word[:-1] if word.endswith("s") and len(word) > 3 else word) in haystack.replace(" ", "")
        for word in words)


def origin():
    s = get_settings()
    return (s.app_public_url or s.render_external_url or "https://cc-mobile-1.onrender.com").rstrip("/")


def own_media(value):
    if isinstance(value, list):
        return [own_media(item) for item in value]
    if isinstance(value, dict):
        return {key: own_media(item) for key, item in value.items()}
    if isinstance(value, str):
        if value.startswith(("/v1/app-media/", "/v1/content/assets/")):
            return origin() + value
        if urlsplit(value).hostname in ("cakecity.co.ke", "www.cakecity.co.ke", "i0.wp.com", "i1.wp.com", "i2.wp.com"):
            from urllib.parse import quote
            return origin() + "/v1/app-media/source?url=" + quote(value, safe="")
    return value


def product_view(row):
    value = own_media(row.payload)
    if row.parent_id is not None:
        value["parent"] = row.parent_id
    # Imported product availability is not permission to spend shared website stock.
    made_to_order = row.payload.get("order_mode") == "made_to_order"
    available = row.enabled and (made_to_order or row.allocation - row.reserved - row.sold > 0)
    if value.get("type") == "variable":
        # Variations carry their own allocations; the selector resolves them locally.
        available = row.enabled
    value["is_in_stock"] = available
    value["order_mode"] = "made_to_order" if made_to_order else "stocked"
    value["is_purchasable"] = row.enabled and (value.get("type") == "variable" or row.price_minor is not None)
    if row.price_minor is not None:
        value.setdefault("prices", {}).update(price=str(row.price_minor), currency_code="KES", currency_minor_unit=2)
    return value


def products(db, params):
    rows = [r for r in db.scalars(select(AppProduct)) if not r.payload.get("payment_test")]
    if params.get("type") == "variation":
        rows = [r for r in rows if r.parent_id is not None]
    else:
        rows = [r for r in rows if r.parent_id is None]
    if params.get("include"):
        ids = {int(i) for i in str(params["include"]).split(",") if i.isdigit()}
        rows = [r for r in rows if r.id in ids]
    if params.get("category"):
        ids = {int(i) for i in str(params["category"]).split(",") if i.isdigit()}
        rows = [r for r in rows if any(c.get("id") in ids for c in r.payload.get("categories", []))]
    if params.get("search"):
        rows = [r for r in rows if search_matches(r, params["search"])]
    if str(params.get("on_sale", "")).lower() == "true":
        rows = [r for r in rows if r.payload.get("on_sale")]
    for name, predicate in (("min_price", lambda price, bound: price >= bound), ("max_price", lambda price, bound: price <= bound)):
        if params.get(name) is not None:
            rows = [r for r in rows if r.price_minor is not None and predicate(r.price_minor, int(params[name]))]
    orderby = params.get("orderby", "id")
    if orderby == "price":
        key = lambda r: (r.price_minor if r.price_minor is not None else 2_000_000_000, r.id)
    elif orderby == "title":
        key = lambda r: (str(r.payload.get("name", "")).casefold(), r.id)
    elif orderby == "popularity":
        key = lambda r: (r.sold, r.id)  # Only app sales, not an invented shared count.
    elif orderby == "rating":
        key = lambda r: (float(r.payload.get("average_rating", 0)), r.id)
    else:
        key = lambda r: r.id
    rows.sort(key=key, reverse=str(params.get("order", "asc")).lower() == "desc")
    page, per_page = int(params.get("page", 1)), int(params.get("per_page", 24))
    return [product_view(r) for r in rows[(page-1)*per_page:page*per_page]], (len(rows)+per_page-1)//per_page


@router.get("/v1/app-media/source")
def source_media(url: str = Query(max_length=3000), db: Session = Depends(get_db)):
    media = db.scalar(select(AppMedia).where(AppMedia.source_url == url))
    if not media:
        raise HTTPException(404, "This app image has not been imported.")
    return Response(media.data, media_type=media.mime, headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})


@router.get("/v1/app-media/{identity}")
def media(identity: str, db: Session = Depends(get_db)):
    row = db.get(AppMedia, identity)
    if not row:
        raise HTTPException(404, "Image not found")
    return Response(row.data, media_type=row.mime, headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})


@router.get("/v1/catalogue/categories")
def categories(db: Session = Depends(get_db)):
    found = {}
    for row in db.scalars(select(AppProduct).where(AppProduct.parent_id.is_(None))):
        for category in row.payload.get("categories", []):
            found[category["id"]] = {**category, "count": found.get(category["id"], {}).get("count", 0) + 1}
    return sorted(found.values(), key=lambda item: item.get("name", ""))


@router.get("/v1/pages")
def pages(db: Session = Depends(get_db)):
    return [{"slug": r.slug, "title": r.title, "revision": r.revision} for r in db.scalars(select(AppPage).where(AppPage.published.is_(True)))]


@router.get("/v1/pages/{slug}")
def page(slug: str, db: Session = Depends(get_db)):
    row = db.get(AppPage, slug)
    if not row or not row.published:
        raise HTTPException(404, "This page has not been published in the app. Please contact app support.")
    return {"slug": row.slug, "title": row.title, "body": row.body, "revision": row.revision}
