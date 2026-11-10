"""Admin integration operations; customers never get a generic ERP proxy."""
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Customer
from .odoo_client import OdooClient, RESOURCES
from .odoo_models import OdooBinding, OdooCursor, OdooOutbox
from .odoo_sync import Change, apply_change, drain, pull
from .permissions import audit
from .routes_club import member

router = APIRouter(tags=["odoo-integration"])


def administrator(customer: Customer = Depends(member)):
    if customer.role != "admin":
        raise HTTPException(403, "Odoo integration administrator access required.")
    return customer


@router.get("/v1/admin/odoo/status")
def status(_: Customer = Depends(administrator), db: Session = Depends(get_db)):
    s = get_settings()
    cursor = db.get(OdooCursor, s.odoo_source_id)
    return {"enabled": s.odoo_enabled, "source": s.odoo_source_id,
        "loyalty_authority": "odoo" if s.odoo_loyalty_authority else "app",
        "connection_configured": bool(s.odoo_url and s.odoo_database and s.odoo_api_key and s.odoo_company_id),
        "cursor": cursor.cursor if cursor else 0,
        "last_sync": cursor.last_success.isoformat() if cursor and cursor.last_success else None,
        "outbox": dict(db.execute(select(OdooOutbox.state, func.count()).where(
            OdooOutbox.source == s.odoo_source_id).group_by(OdooOutbox.state)).all()),
        "resources": RESOURCES}


@router.post("/v1/admin/odoo/check")
async def check(actor: Customer = Depends(administrator), db: Session = Depends(get_db)):
    result = await OdooClient().bridge("capabilities")
    if not isinstance(result, dict) or result.get("contract") != "cakecity-odoo-v1":
        raise HTTPException(502, "Install the matching Cake City Odoo 19 addon.")
    audit(db, actor.id, "odoo_connection_checked", get_settings().odoo_source_id)
    db.commit()
    return result


@router.get("/v1/admin/odoo/schema/{resource}")
async def schema(resource: str, _: Customer = Depends(administrator)):
    model = RESOURCES.get(resource)
    if not model:
        raise HTTPException(404, "Unknown Odoo resource.")
    return {"model": model, "fields": await OdooClient().call(model, "fields_get",
        attributes=["string", "type", "required", "readonly", "relation", "selection"])}


@router.get("/v1/admin/odoo/records/{resource}")
def records(resource: str, _: Customer = Depends(administrator), db: Session = Depends(get_db)):
    if resource not in RESOURCES:
        raise HTTPException(404, "Unknown Odoo resource.")
    return [{"id": r.external_id, "local_id": r.local_id, "version": r.version, "payload": r.payload}
        for r in db.scalars(select(OdooBinding).where(OdooBinding.source == get_settings().odoo_source_id,
            OdooBinding.resource == resource).order_by(OdooBinding.id).limit(5000))]


class Batch(BaseModel):
    limit: int = Field(default=50, ge=1, le=100)


class RiderLink(BaseModel):
    customer_id: str = Field(min_length=1, max_length=36)


@router.put("/v1/admin/odoo/riders/{external_id}/account")
def link_rider(external_id: str, data: RiderLink, actor: Customer = Depends(administrator), db: Session = Depends(get_db)):
    from .odoo_sync import binding
    row = binding(db, "riders", external_id)
    rider = db.get(Customer, data.customer_id)
    if not row or not rider or rider.role not in {"rider", "driver"}:
        raise HTTPException(422, "Import the Odoo rider and provision its app rider account first.")
    row.local_id = rider.id
    audit(db, actor.id, "odoo_rider_linked", external_id, customer_id=rider.id)
    db.commit()
    return {"status": "linked"}


@router.post("/v1/admin/odoo/pull")
async def import_changes(data: Batch, actor: Customer = Depends(administrator), db: Session = Depends(get_db)):
    result = await pull(db, data.limit)
    audit(db, actor.id, "odoo_pull", get_settings().odoo_source_id, **result)
    db.commit()
    return result


@router.post("/v1/admin/odoo/push")
async def export_changes(data: Batch, actor: Customer = Depends(administrator), db: Session = Depends(get_db)):
    result = await drain(db, data.limit)
    audit(db, actor.id, "odoo_push", get_settings().odoo_source_id, **result)
    db.commit()
    return result


@router.post("/v1/integrations/odoo/events")
async def incoming(request: Request, x_odoo_timestamp: str = Header(default=""),
                   x_odoo_signature: str = Header(default=""), db: Session = Depends(get_db)):
    s = get_settings()
    if not s.odoo_enabled or len(s.odoo_webhook_secret) < 32:
        raise HTTPException(503, "Odoo event ingestion is not configured.")
    raw = await request.body()
    if len(raw) > 3_000_000:
        raise HTTPException(413, "Odoo event too large.")
    try:
        if abs(time.time()-int(x_odoo_timestamp)) > 300:
            raise ValueError()
    except ValueError:
        raise HTTPException(401, "Expired Odoo event signature.") from None
    expected = hmac.new(s.odoo_webhook_secret.encode(), x_odoo_timestamp.encode()+b"."+raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_odoo_signature):
        raise HTTPException(401, "Invalid Odoo event signature.")
    try:
        change = Change.model_validate_json(raw)
    except ValueError:
        raise HTTPException(422, "Invalid Odoo event.") from None
    result = apply_change(db, change)
    db.commit()
    from .catalogue import catalogue
    catalogue.cache.clear()
    return {"status": result}
