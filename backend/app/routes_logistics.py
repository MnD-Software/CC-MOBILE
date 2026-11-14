"""Independent kitchen, dispatch and rider APIs. Odoo is optional."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Literal
from sqlalchemy.exc import IntegrityError
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import logistics as service
from .commerce_models import AppOrder
from .db import get_db
from .logistics_models import LogisticsScope, LogisticsTask, ProductionTask
from .models import Customer
from .permissions import audit
from .routes_club import member

router = APIRouter(tags=["kitchen-and-logistics"])


class BulkWork(BaseModel):
    references: list[str] = Field(min_length=1,max_length=20)
    action: Literal['preparing','ready','assign_rider']
    rider_id: str | None = Field(default=None,max_length=36)


@router.post('/v1/logistics/bulk-work')
def bulk_work(data:BulkWork,actor:Customer=Depends(member),db:Session=Depends(get_db)):
    permitted=service.DISPATCH if data.action=='assign_rider' else service.KITCHEN
    if actor.role not in permitted: raise HTTPException(403,'This workflow action is outside your department')
    if len(set(data.references))!=len(data.references): raise HTTPException(422,'Select each order once')
    results=[]
    for reference in data.references:
        try:
            if data.action=='assign_rider':
                if not data.rider_id: raise HTTPException(422,'Choose a rider')
                service.new_trip(db,actor,reference,service.NewTrip(rider_id=data.rider_id))
            else: service.kitchen_status(db,actor,reference,data.action)
            results.append({'reference':reference,'ok':True})
        except HTTPException as error:
            db.rollback()
            results.append({'reference':reference,'ok':False,'message':str(error.detail)})
    return {'results':results}


@router.get("/v1/delivery-tracking/map", response_class=HTMLResponse)
def tracking_map():
    # Static shell only; private coordinates arrive from the authenticated app, never URLs.
    return HTMLResponse(Path(__file__).with_name("tracking-map.html").read_text(encoding="utf-8"), headers={"Cache-Control": "public, max-age=3600", "Referrer-Policy": "strict-origin-when-cross-origin"})


def kitchen(customer: Customer = Depends(member)):
    if customer.role not in service.KITCHEN:
        raise HTTPException(403, "Kitchen workspace access required.")
    return customer


def dispatch(customer: Customer = Depends(member)):
    if customer.role not in service.DISPATCH:
        raise HTTPException(403, "Dispatch workspace access required.")
    return customer


def rider(customer: Customer = Depends(member)):
    if customer.role not in service.RIDERS:
        raise HTTPException(403, "Rider or driver access required.")
    return customer


def queue(db, actor):
    result = []
    for order in db.scalars(select(AppOrder).where(AppOrder.payment_state == "completed",
            AppOrder.state.in_(["paid", "preparing", "ready", "out_for_delivery"]))
            .order_by(AppOrder.created_at).limit(300)):
        production = db.get(ProductionTask, order.id)
        plant = production.plant if production else "hq"
        if not service.allowed_plant(db, actor, plant):
            continue
        result.append({"reference": order.reference, "status": order.state,
            "plant": production.plant if production else None,
            "assigned_to": production.assigned_to if production else None,
            "attention": "unassigned" if not production else "active",
            "fulfilment": order.snapshot.get("checkout", {}).get("fulfilment"),
            "items": [{key: line[key] for key in ("name", "quantity", "sku_id", "selection") if key in line}
                      for line in order.snapshot.get("lines", [])],
            "created_at": service.commerce.utc(order.created_at).isoformat(), "payment_test": order.channel == "app_test",
            "review_checkout": bool(order.snapshot.get("review_checkout"))})
    return result


@router.get("/v1/kitchen/orders")
def kitchen_queue(actor: Customer = Depends(kitchen), db: Session = Depends(get_db)):
    return queue(db, actor)


@router.get("/v1/kitchen/locations")
def kitchen_locations(actor: Customer = Depends(kitchen), db: Session = Depends(get_db)):
    codes = {"hq"} | set(db.scalars(select(LogisticsScope.plant).distinct()))
    return [{"id": code, "name": "Head Office" if code == "hq" else code.removeprefix("branch:").replace("-", " ").title()}
        for code in sorted(codes) if service.allowed_plant(db, actor, code)]


@router.put("/v1/kitchen/orders/{reference}/assignment")
def assign_kitchen(reference: str, data: service.AssignProduction, actor: Customer = Depends(kitchen), db: Session = Depends(get_db)):
    return service.assign_production(db, actor, reference, data)


class KitchenStatus(BaseModel):
    status: str = Field(pattern="^(preparing|ready)$")


@router.patch("/v1/kitchen/orders/{reference}/status")
def kitchen_progress(reference: str, data: KitchenStatus, actor: Customer = Depends(kitchen), db: Session = Depends(get_db)):
    return service.kitchen_status(db, actor, reference, data.status)


@router.get("/v1/logistics/orders")
def dispatch_queue(actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    return queue(db, actor)


@router.get("/v1/logistics/riders")
def riders(_: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    return [{"id": row.id, "name": " ".join([row.first_name, row.last_name]), "role": row.role}
        for row in db.scalars(select(Customer).where(Customer.role.in_(service.RIDERS)).order_by(Customer.first_name).limit(1000))]


class RiderAccount(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=7, max_length=40)
    password: str = Field(min_length=8, max_length=128)


@router.post("/v1/logistics/riders", status_code=201)
def create_rider(data: RiderAccount, actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    from .security import hash_password
    email = str(data.email).strip().lower()
    if db.scalar(select(Customer.id).where(Customer.email == email)):
        raise HTTPException(409, "An account already uses that email. An administrator must review existing accounts.")
    plants = set(db.scalars(select(LogisticsScope.plant).where(LogisticsScope.customer_id == actor.id)))
    if actor.role in service.MANAGERS | {"dispatch"}: plants.add("hq")
    if not plants:
        raise HTTPException(403, "An operational location is required before creating riders.")
    rider = Customer(id=str(uuid4()), email=email, first_name=data.first_name.strip(), last_name=data.last_name.strip(),
        phone=data.phone.strip(), password_hash=hash_password(data.password), role="rider")
    try:
        db.add(rider)
        db.flush()
        for plant in plants:
            db.add(LogisticsScope(customer_id=rider.id, plant=plant))
        audit(db, actor.id, "rider_account_created", rider.id, plants=sorted(plants))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That email was registered elsewhere. Refresh the rider list.") from None
    return {"id": rider.id, "name": f"{rider.first_name} {rider.last_name}", "role": "rider"}


@router.post("/v1/logistics/orders/{reference}/collection")
def confirm_collection(reference: str, actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    order = service.paid_order(db, reference)
    production = db.get(ProductionTask, order.id)
    service.require_plant(db, actor, production.plant if production else "hq")
    if order.snapshot.get("checkout", {}).get("fulfilment") != "pickup":
        raise HTTPException(409, "Delivery orders must be completed through rider delivery confirmation.")
    if order.state == "completed":
        return {"status": "completed"}
    if order.state != "ready":
        raise HTTPException(409, "Kitchen must mark this order ready before collection.")
    if any(task.status not in {"delivered", "cancelled"} for task in db.scalars(select(LogisticsTask).where(LogisticsTask.order_id == order.id))):
        raise HTTPException(409, "Complete the branch transfer before confirming customer collection.")
    order.state = "completed"
    service.commerce.record_event(db, order, "fulfilment_completed", actor_id=actor.id)
    audit(db, actor.id, "customer_collection_confirmed", reference)
    db.commit()
    return {"status": "completed"}


@router.post("/v1/logistics/orders/{reference}/tasks", status_code=201)
def create_trip(reference: str, data: service.NewTrip, actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    return service.task_view(db, service.new_trip(db, actor, reference, data))


@router.get("/v1/logistics/tasks")
def tasks(actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    return [service.task_view(db, task, history=True) for task in db.scalars(select(LogisticsTask)
        .order_by(LogisticsTask.created_at.desc()).limit(300)) if service.allowed_plant(db, actor, task.plant)]


@router.patch("/v1/logistics/tasks/{identity}")
def manage_trip(identity: str, data: service.TaskUpdate, actor: Customer = Depends(dispatch), db: Session = Depends(get_db)):
    return service.update_task(db, actor, identity, data)


@router.get("/v1/rider/tasks")
def my_tasks(actor: Customer = Depends(rider), db: Session = Depends(get_db)):
    return [service.task_view(db, task, history=True) for task in db.scalars(select(LogisticsTask)
        .where(LogisticsTask.rider_id == actor.id).order_by(LogisticsTask.created_at.desc()).limit(100))]


@router.patch("/v1/rider/tasks/{identity}")
def rider_progress(identity: str, data: service.TaskUpdate, actor: Customer = Depends(rider), db: Session = Depends(get_db)):
    return service.update_task(db, actor, identity, data)


from .live_tracking import Position


@router.put("/v1/rider/tasks/{identity}/location")
def rider_location(identity: str, data: Position, actor: Customer = Depends(rider), db: Session = Depends(get_db)):
    from .live_tracking import publish
    return publish(db, actor, identity, data)


@router.delete("/v1/rider/tasks/{identity}/location", status_code=204)
def stop_location(identity: str, actor: Customer = Depends(rider), db: Session = Depends(get_db)):
    from .live_tracking import stop
    stop(db, actor, identity)


class Scope(BaseModel):
    plant: str = Field(pattern=r"^(hq|branch:[a-z0-9-]+)$", max_length=100)


@router.post("/v1/admin/logistics/scopes/{customer_id}")
def grant_scope(customer_id: str, data: Scope, actor: Customer = Depends(member), db: Session = Depends(get_db)):
    if actor.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    if not db.get(Customer, customer_id):
        raise HTTPException(404, "Team member not found.")
    if not db.get(LogisticsScope, (customer_id, data.plant)):
        db.add(LogisticsScope(customer_id=customer_id, plant=data.plant))
    audit(db, actor.id, "logistics_scope_granted", customer_id, plant=data.plant)
    db.commit()
    return {"status": "granted"}
