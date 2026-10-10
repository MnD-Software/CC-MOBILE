"""Staff-managed merchandising, independent of WooCommerce price/stock authority."""
import base64
import binascii
import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer, EditorialAsset, EditorialContent
from .routes_enquiries import staff

router = APIRouter(tags=["editorial"])


def media_url(value: str) -> str:
    if not value:
        return value
    if value.startswith("/v1/content/assets/") and len(value.rsplit("/", 1)[-1]) == 64:
        if all(c in "0123456789abcdef" for c in value.rsplit("/", 1)[-1]):
            return value
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Use an HTTPS media URL or an uploaded editorial asset")
    return value


class CampaignInput(BaseModel):
    revision: int = Field(default=0, ge=0)
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(default="", max_length=600)
    image_url: str = Field(max_length=1500)
    video_url: str = Field(default="", max_length=1500)
    starts_at: datetime
    ends_at: datetime
    product_slugs: list[str] = Field(default_factory=list, max_length=8)
    category_id: int | None = Field(default=None, gt=0)
    branch_names: list[str] = Field(default_factory=list, max_length=20)
    member_only: bool = False
    published: bool = False
    template: Literal["spotlight", "celebration", "offer"] = "spotlight"

    @field_validator("image_url", "video_url")
    @classmethod
    def urls(cls, value):
        return media_url(value)

    @field_validator("product_slugs", "branch_names")
    @classmethod
    def labels(cls, values):
        if any(not v.strip() or len(v) > 160 for v in values) or len(set(values)) != len(values):
            raise ValueError("Use unique, nonempty values up to 160 characters")
        return values

    @model_validator(mode="after")
    def schedule(self):
        if not self.starts_at.tzinfo or not self.ends_at.tzinfo or self.starts_at >= self.ends_at:
            raise ValueError("Start and end must include a timezone; end must follow start")
        if not self.product_slugs and not self.category_id:
            raise ValueError("Link at least one real product slug or catalogue category")
        if not self.image_url:
            raise ValueError("Campaign artwork is required")
        return self


class ProductEditorialInput(BaseModel):
    revision: int = Field(default=0, ge=0)
    product_id: int = Field(gt=0)
    published: bool = False
    image_urls: list[str] = Field(default_factory=list, max_length=6)
    video_url: str = Field(default="", max_length=1500)
    flavour: str = Field(default="", max_length=160)
    servings: str = Field(default="", max_length=100)
    preparation_hours: int | None = Field(default=None, ge=0, le=336)
    photography_notes: str = Field(default="", max_length=500)

    @field_validator("video_url")
    @classmethod
    def video(cls, value):
        return media_url(value)

    @field_validator("image_urls")
    @classmethod
    def images(cls, values):
        if any(not value or len(value) > 1500 for value in values):
            raise ValueError("Invalid image URL")
        return [media_url(value) for value in values]


def active(payload, now):
    return payload.get("published") and datetime.fromisoformat(payload["starts_at"]) <= now < datetime.fromisoformat(payload["ends_at"])


def output(record):
    return {**record.payload, "id": record.id, "revision": record.revision}


@router.get("/v1/content")
def content(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=30"
    now = datetime.now(UTC)
    rows = db.scalars(select(EditorialContent).where(EditorialContent.kind == "campaign").order_by(EditorialContent.updated_at.desc())).all()
    return {"campaigns": [output(row) for row in rows if active(row.payload, now)][:30]}


@router.get("/v1/content/products/{product_id}")
def product_content(product_id: int, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=60"
    row = db.get(EditorialContent, f"product-{product_id}")
    return output(row) if row and row.payload.get("published") else None


@router.get("/v1/admin/content")
def queue(_: Customer = Depends(staff), db: Session = Depends(get_db)):
    return [dict(output(row), kind=row.kind) for row in db.scalars(select(EditorialContent).order_by(EditorialContent.updated_at.desc()).limit(150))]


def save(db, identity, kind, payload, customer):
    row = db.scalar(select(EditorialContent).where(EditorialContent.id == identity).with_for_update())
    if row:
        if row.kind != kind or row.revision != payload.revision:
            raise HTTPException(409, "Content changed. Reload before saving.")
        row.revision += 1
        row.payload = payload.model_dump(mode="json", exclude={"revision"})
        row.updated_by = customer.id
    else:
        if payload.revision != 0:
            raise HTTPException(409, "Content no longer exists")
        row = EditorialContent(id=identity, kind=kind, payload=payload.model_dump(mode="json", exclude={"revision"}), revision=1, updated_by=customer.id)
        db.add(row)
    db.commit()
    return output(row)


@router.post("/v1/admin/content/campaigns", status_code=201)
def create_campaign(payload: CampaignInput, customer: Customer = Depends(staff), db: Session = Depends(get_db)):
    return save(db, str(uuid4()), "campaign", payload, customer)


@router.put("/v1/admin/content/campaigns/{identity}")
def edit_campaign(identity: str, payload: CampaignInput, customer: Customer = Depends(staff), db: Session = Depends(get_db)):
    if not db.get(EditorialContent, identity):
        raise HTTPException(404, "Campaign not found")
    return save(db, identity, "campaign", payload, customer)


@router.put("/v1/admin/content/products/{product_id}")
def edit_product(product_id: int, payload: ProductEditorialInput, customer: Customer = Depends(staff), db: Session = Depends(get_db)):
    if product_id != payload.product_id:
        raise HTTPException(422, "Product ID does not match")
    return save(db, f"product-{product_id}", "product", payload, customer)


class AssetInput(BaseModel):
    mime: Literal["image/jpeg", "image/png", "image/webp", "video/mp4"]
    data: str = Field(min_length=4, max_length=14_000_000)


@router.post("/v1/admin/content/assets", status_code=201)
def upload_asset(payload: AssetInput, customer: Customer = Depends(staff), db: Session = Depends(get_db)):
    try:
        data = base64.b64decode(payload.data, validate=True)
    except (ValueError, binascii.Error) as error:
        raise HTTPException(422, "Invalid media encoding") from error
    signatures = {
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        "video/mp4": data[4:8] == b"ftyp",
    }
    limit = 10_000_000 if payload.mime == "video/mp4" else 2_000_000
    if not signatures[payload.mime] or not 12 <= len(data) <= limit:
        raise HTTPException(422, "Use a valid image under 2 MB or MP4 under 10 MB")
    identity = hashlib.sha256(data).hexdigest()
    if not db.get(EditorialAsset, identity):
        db.add(EditorialAsset(id=identity, mime=payload.mime, data=data, uploaded_by=customer.id))
        db.commit()
    return {"url": f"/v1/content/assets/{identity}", "bytes": len(data), "mime": payload.mime}


@router.get("/v1/content/assets/{identity}")
def asset(identity: str, db: Session = Depends(get_db)):
    row = db.get(EditorialAsset, identity)
    if not row:
        raise HTTPException(404, "Artwork not found")
    return Response(row.data, media_type=row.mime, headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
