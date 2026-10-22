from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import Customer, AdministrativeEvent
from .permissions import ROLE_PERMISSIONS, require
from .routes_club import member

router = APIRouter(tags=["workspace"])


@router.get("/v1/workspace/session")
def session(customer: Customer = Depends(member)):
    return {"role": customer.role, "permissions": sorted(ROLE_PERMISSIONS.get(customer.role, set())),
            "financial_reporting_available": False, "branch_scoping_available": False}


@router.get("/v1/admin/audit")
def history(actor: Customer = Depends(require("audit.read")), db: Session = Depends(get_db)):
    return [{"id": row.id, "action": row.action, "resource_id": row.resource_id,
             "created_at": row.created_at, "details": row.details}
            for row in db.scalars(select(AdministrativeEvent).order_by(AdministrativeEvent.created_at.desc(), AdministrativeEvent.id).limit(100))]
