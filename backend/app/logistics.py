"""One order can have many assigned stops; payments are never copied per trip."""
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update

from . import app_commerce as commerce
from .commerce_models import AppOrder, AppOrderEvent
from .logistics_models import LogisticsEvent, LogisticsScope, LogisticsTask, ProductionTask
from .models import Customer
from .permissions import audit

MANAGERS = {"admin", "staff", "ecommerce_manager"}
KITCHEN = MANAGERS | {"production", "head_chef"}
DISPATCH = MANAGERS | {"dispatch", "branch_dispatch", "branch_manager"}
RIDERS = {"rider", "driver"}
TERMINAL = {"delivered", "cancelled"}


def allowed_plant(db, actor, plant):
    if actor.role in MANAGERS:
        return True
    if actor.role in {"dispatch", "production", "head_chef"} and plant == "hq":
        return True
    return bool(db.get(LogisticsScope, (actor.id, plant)))


def require_plant(db, actor, plant):
    if not allowed_plant(db, actor, plant):
        raise HTTPException(403, "This production location is outside your assigned workspace.")


def paid_order(db, reference):
    row = db.scalar(select(AppOrder).where(AppOrder.reference == reference).with_for_update())
    if not row or row.payment_state != "completed" or row.state in ("review_required", "cancelled", "payment_failed"):
        raise HTTPException(409, "Kitchen and dispatch require a verified paid order without an unresolved payment issue.")
    return row


class AssignProduction(BaseModel):
    plant: str = Field(pattern=r"^(hq|branch:[a-z0-9-]+)$", max_length=100)
    assigned_to: str = Field(min_length=1, max_length=36)


def assign_production(db, actor, reference, data):
    order = paid_order(db, reference)
    require_plant(db, actor, data.plant)
    worker = db.get(Customer, data.assigned_to)
    if not worker or worker.role not in KITCHEN or not allowed_plant(db, worker, data.plant):
        raise HTTPException(422, "Choose an authorized kitchen team member for this location.")
    if actor.role not in MANAGERS | {"head_chef"} and actor.id != worker.id:
        raise HTTPException(403, "A kitchen manager must assign work to another team member.")
    task = db.get(ProductionTask, order.id)
    if task:
        require_plant(db, actor, task.plant)
        if order.state != "paid" and task.plant != data.plant:
            raise HTTPException(409, "Production has started; its origin cannot be changed here.")
        if task.plant != data.plant and db.scalar(select(LogisticsTask.id).where(LogisticsTask.order_id == order.id).limit(1)):
            raise HTTPException(409, "Dispatch tasks already use this production origin.")
        task.plant, task.assigned_to = data.plant, worker.id
        task.revision += 1
    else:
        task = ProductionTask(order_id=order.id, plant=data.plant, assigned_to=worker.id, assigned_at=datetime.now(UTC))
        db.add(task)
    audit(db, actor.id, "production_assigned", reference, plant=data.plant, assigned_to=worker.id)
    from .odoo_sync import enqueue
    enqueue(db, "kitchen.assigned", reference, {"reference": reference, "plant": data.plant, "assigned_to": worker.id})
    db.commit()
    return {"status": "assigned", "reference": reference}


def kitchen_status(db, actor, reference, status):
    order = paid_order(db, reference)
    task = db.get(ProductionTask, order.id)
    if not task:
        raise HTTPException(409, "Assign the kitchen task and production location first.")
    require_plant(db, actor, task.plant)
    if actor.role not in MANAGERS | {"head_chef"} and task.assigned_to != actor.id:
        raise HTTPException(403, "Only the assigned kitchen team member can update this task.")
    if status not in {"preparing", "ready"} or (order.state, status) not in {("paid", "preparing"), ("preparing", "ready")}:
        if order.state == status:
            return {"status": status}
        raise HTTPException(409, "This kitchen transition is not available.")
    order.state = status
    commerce.record_event(db, order, "fulfilment_" + status, actor_id=actor.id)
    audit(db, actor.id, "kitchen_status", reference, status=status)
    db.commit()
    return {"status": status}


class TaskItem(BaseModel):
    sku_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=10000)


class NewTrip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rider_id: str = Field(min_length=1, max_length=36)
    destination: str = Field(default="", max_length=500)
    recipient: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    service_type: str = Field(default="delivery", pattern="^(delivery|branch_transfer)$")
    resource_type: str = Field(default="internal_rider", pattern="^(internal_rider|in_house_driver|external_rider)$")
    external_reason: str = Field(default="", max_length=500)
    items: list[TaskItem] | None = Field(default=None, min_length=1, max_length=50)
    scheduled_at: datetime | None = None
    slot: str = Field(default="", max_length=80)
    pv_reference: str = Field(default="", max_length=100)

    @field_validator("scheduled_at")
    @classmethod
    def timezone_required(cls, value):
        if value and value.tzinfo is None:
            raise ValueError("Scheduled times must include a timezone.")
        return value


def new_trip(db, actor, reference, data, commit=True):
    order = paid_order(db, reference)
    if order.state == "completed":
        raise HTTPException(409, "This order is already completed.")
    production = db.get(ProductionTask, order.id)
    if not production:
        raise HTTPException(409, "Confirm the production location before allocating a rider.")
    if actor is not None:
        require_plant(db, actor, production.plant)
    rider = db.get(Customer, data.rider_id)
    if not rider or rider.role not in RIDERS:
        raise HTTPException(422, "Choose a provisioned rider or driver account.")
    if data.service_type == "delivery" and order.snapshot.get("checkout", {}).get("fulfilment") != "delivery":
        raise HTTPException(409, "Customer pickup needs a separate branch-transfer task, not a delivery.")
    if data.resource_type == "external_rider" and (data.service_type != "delivery" and len(data.external_reason.strip()) < 10):
        raise HTTPException(422, "Document internal resource unavailability before an external pickup assignment.")
    totals = {}
    for line in order.snapshot["lines"]:
        totals[line["sku_id"]] = totals.get(line["sku_id"], 0)+line["quantity"]
    existing = list(db.scalars(select(LogisticsTask).where(LogisticsTask.order_id == order.id, LogisticsTask.status != "cancelled")))
    remaining = dict(totals)
    for task in existing:
        for item in task.items:
            remaining[item["sku_id"]] = remaining.get(item["sku_id"], 0)-item["quantity"]
    items = [item.model_dump() for item in data.items] if data.items else [
        {"sku_id": sku, "quantity": quantity} for sku, quantity in remaining.items() if quantity > 0]
    if not items:
        raise HTTPException(409, "Every purchased item is already assigned to a dispatch task.")
    for item in items:
        remaining[item["sku_id"]] = remaining.get(item["sku_id"], 0)-item["quantity"]
        if remaining[item["sku_id"]] < 0:
            raise HTTPException(409, "Dispatch task quantities exceed this paid order.")
    checkout = order.snapshot.get("checkout", {})
    billing = checkout.get("billing", {})
    destination = data.destination or (order.snapshot.get("route") or {}).get("destination_address") or billing.get("address", "")
    if not destination.strip():
        raise HTTPException(422, "Confirm this task's destination before assigning it.")
    task = LogisticsTask(id=str(uuid4()), order_id=order.id, plant=production.plant,
        service_type=data.service_type, rider_id=rider.id, resource_type=data.resource_type,
        external_reason=data.external_reason, destination=destination,
        recipient=data.recipient or checkout.get("recipient_name") or " ".join(filter(None, [billing.get("first_name"), billing.get("last_name")])),
        phone=data.phone or checkout.get("recipient_phone") or billing.get("phone", ""), items=items,
        scheduled_at=data.scheduled_at, slot=data.slot, pv_reference=data.pv_reference, status="assigned")
    db.add(task)
    db.flush()
    task_event(db, task, actor.id if actor else None, "assigned")
    if actor:
        audit(db, actor.id, "logistics_task_assigned", task.id, reference=reference, rider_id=rider.id, plant=production.plant)
    if commit:
        db.commit()
    return task


def task_view(db, task, history=False):
    order = db.get(AppOrder, task.order_id)
    rider = db.get(Customer, task.rider_id) if task.rider_id else None
    from .ride_feedback import for_task
    result = {"id": task.id, "reference": order.reference, "status": task.status, "revision": task.revision,
        "plant": task.plant, "service_type": task.service_type, "destination": task.destination,
        "recipient": task.recipient, "phone": task.phone, "items": task.items,
        "scheduled_at": commerce.utc(task.scheduled_at).isoformat() if task.scheduled_at else None,
        "slot": task.slot, "rider_id": task.rider_id,
        "rider_name": " ".join([rider.first_name, rider.last_name]) if rider else None,
        "feedback": for_task(db, task),
        "payment_test": order.channel == "app_test", "review_checkout": bool(order.snapshot.get("review_checkout")),
        "delivery_notes": str(order.snapshot.get("checkout", {}).get("notes", ""))}
    lines = {line.get("sku_id"): line for line in order.snapshot.get("lines", [])}
    result["items"] = [{**item, "name": lines.get(item.get("sku_id"), {}).get("name", "Cake"),
        "selection": lines.get(item.get("sku_id"), {}).get("selection", {})} for item in task.items]
    if history:
        result["events"] = [{"status": e.status, "note": e.note, "proof": e.proof,
            "at": commerce.utc(e.created_at).isoformat()} for e in db.scalars(select(LogisticsEvent).where(
                LogisticsEvent.task_id == task.id).order_by(LogisticsEvent.created_at, LogisticsEvent.id))]
    return result


def task_event(db, task, actor_id, status, note="", proof=""):
    db.add(LogisticsEvent(id=str(uuid4()), task_id=task.id, actor_id=actor_id, status=status, note=note, proof=proof, created_at=datetime.now(UTC)))
    from .odoo_sync import enqueue
    order = db.get(AppOrder, task.order_id)
    from .notifications import rider_event
    rider_event(db, task, order, status)
    if order.channel != "app_test" and order.environment == "live":
        enqueue(db, "logistics.task.changed", task.id, task_view(db, task))


class TaskUpdate(BaseModel):
    revision: int = Field(ge=1)
    status: str = Field(pattern="^(accepted|collected|in_transit|delivered|failed|rescheduled|cancelled)$")
    note: str = Field(default="", max_length=1000)
    proof: str = Field(default="", max_length=1000)
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at")
    @classmethod
    def valid_schedule(cls, value):
        if value and value.tzinfo is None:
            raise ValueError("Scheduled times must include a timezone.")
        return value


def update_task(db, actor, identity, data):
    task = db.scalar(select(LogisticsTask).where(LogisticsTask.id == identity).with_for_update())
    if not task or (actor and actor.role in RIDERS and task.rider_id != actor.id):
        raise HTTPException(404, "Dispatch task not found.")
    if actor and actor.role not in RIDERS:
        require_plant(db, actor, task.plant)
    order = paid_order(db, db.get(AppOrder, task.order_id).reference)
    if actor and actor.role in RIDERS and data.status in {"rescheduled", "cancelled"}:
        raise HTTPException(403, "Dispatch must authorize rescheduling or cancellation.")
    transitions = {"assigned": {"accepted", "failed", "cancelled", "rescheduled"},
        "accepted": {"collected", "failed", "cancelled", "rescheduled"},
        "collected": {"in_transit", "failed"}, "in_transit": {"delivered", "failed"},
        "failed": {"rescheduled", "cancelled"}, "rescheduled": {"accepted", "cancelled"}}
    if data.status not in transitions.get(task.status, set()):
        raise HTTPException(409, "This trip transition is not available.")
    if data.status == "collected" and order.state not in {"ready", "out_for_delivery"}:
        raise HTTPException(409, "Kitchen must mark the cake ready before collection.")
    if data.status == "collected" and task.scheduled_at and commerce.utc(task.scheduled_at) > datetime.now(UTC):
        raise HTTPException(409, "This trip is scheduled for a later time. Dispatch must reschedule it before early collection.")
    if data.status in {"failed", "rescheduled", "cancelled"} and len(data.note.strip()) < 5:
        raise HTTPException(422, "Record a reason for this dispatch exception.")
    if data.status == "delivered" and len(data.proof.strip()) < 3:
        raise HTTPException(422, "Record delivery confirmation before completing the task.")
    if data.scheduled_at and data.status != "rescheduled":
        raise HTTPException(422, "Use a dispatch reschedule to change the planned time.")
    changes = {"status": data.status, "revision": LogisticsTask.revision+1}
    if data.scheduled_at:
        changes["scheduled_at"] = data.scheduled_at
    changed = db.execute(update(LogisticsTask).where(LogisticsTask.id == identity, LogisticsTask.revision == data.revision)
        .values(**changes))
    if changed.rowcount != 1:
        raise HTTPException(409, "This task changed. Refresh before updating it.")
    db.refresh(task)
    task_event(db, task, actor.id if actor else None, data.status, data.note, data.proof)
    if data.status not in {"collected", "in_transit"}:
        from .logistics_models import RiderPosition
        position = db.get(RiderPosition, identity)
        if position:
            db.delete(position)
    if data.status == "in_transit" and task.service_type == "delivery":
        order.state = "out_for_delivery"
        commerce.record_event(db, order, "fulfilment_out_for_delivery", actor_id=actor.id if actor else None)
    if data.status == "delivered" and task.service_type == "delivery":
        tasks = list(db.scalars(select(LogisticsTask).where(LogisticsTask.order_id == order.id, LogisticsTask.status != "cancelled")))
        delivered = {}
        for item in tasks:
            if item.status == "delivered" and item.service_type == "delivery":
                for line in item.items:
                    delivered[line["sku_id"]] = delivered.get(line["sku_id"], 0)+line["quantity"]
        expected = {}
        for line in order.snapshot["lines"]:
            expected[line["sku_id"]] = expected.get(line["sku_id"], 0)+line["quantity"]
        if delivered == expected and all(item.status == "delivered" for item in tasks):
            order.state = "completed"
            commerce.record_event(db, order, "fulfilment_completed", actor_id=actor.id if actor else None)
    if actor:
        audit(db, actor.id, "logistics_task_status", identity, status=data.status)
    if not db.info.get("odoo_import"):
        db.commit()
    return task_view(db, task, history=True)


def import_trip(db, payload, link):
    from .odoo_sync import binding
    rider_link = binding(db, "riders", str(payload.get("rider_id", "")))
    rider = db.get(Customer, rider_link.local_id) if rider_link else None
    if not rider or rider.role not in RIDERS or rider_link.payload.get("_deleted") or not rider_link.payload.get("active"):
        raise HTTPException(409, "Explicitly link the Odoo rider to a provisioned app rider account first.")
    identity = payload.get("app_task_id") or link.local_id
    task = db.get(LogisticsTask, identity)
    previous_import = db.info.get("odoo_import")
    db.info["odoo_import"] = True
    try:
        order = paid_order(db, payload.get("reference"))
        if task and task.order_id != order.id:
            raise HTTPException(409, "An Odoo trip cannot change its originating app order.")
        if not task:
            fields = {key: value for key, value in payload.items() if key in NewTrip.model_fields}
            data = NewTrip.model_validate({**fields, "rider_id": rider.id})
            task = new_trip(db, None, order.reference, data, commit=False)
            link.local_id = task.id
        elif task.rider_id != rider.id:
            if task.status not in {"assigned", "accepted", "rescheduled"}:
                raise HTTPException(409, "A collected trip cannot be reassigned silently.")
            task.rider_id, task.status = rider.id, "assigned"
            task.revision += 1
            task_event(db, task, None, "assigned", note="Reassigned in Odoo")
        target = payload.get("status", "assigned")
        if task.status != target:
            update_task(db, None, task.id, TaskUpdate(revision=task.revision, status=target,
                note=payload.get("note", ""), proof=payload.get("proof", ""),
                scheduled_at=payload.get("scheduled_at") if target == "rescheduled" else None))
    finally:
        db.info["odoo_import"] = previous_import


def import_kitchen(db, payload):
    order = paid_order(db, payload.get("reference"))
    data = AssignProduction.model_validate(payload)
    worker = db.get(Customer, data.assigned_to)
    if not worker or worker.role not in KITCHEN or not allowed_plant(db, worker, data.plant):
        raise HTTPException(409, "Map an authorized app kitchen worker and production location first.")
    task = db.get(ProductionTask, order.id)
    if task and task.plant != data.plant and (order.state != "paid" or db.scalar(select(LogisticsTask.id).where(LogisticsTask.order_id == order.id).limit(1))):
        raise HTTPException(409, "Odoo cannot change a started or dispatched production origin.")
    if not task:
        db.add(ProductionTask(order_id=order.id, plant=data.plant, assigned_to=worker.id, assigned_at=datetime.now(UTC)))
    else:
        task.plant, task.assigned_to = data.plant, worker.id
    target = payload.get("status")
    if target and target != order.state:
        if (order.state, target) not in {("paid", "preparing"), ("preparing", "ready")}:
            raise HTTPException(409, "Odoo kitchen readiness must follow the production sequence.")
        order.state = target
        previous_import = db.info.get("odoo_import")
        db.info["odoo_import"] = True
        try:
            commerce.record_event(db, order, "fulfilment_"+target, source="odoo")
        finally:
            db.info["odoo_import"] = previous_import
