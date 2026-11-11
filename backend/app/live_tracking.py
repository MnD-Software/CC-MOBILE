"""Private trip-scoped location updates, never a public rider-location directory."""
from datetime import UTC, datetime
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from . import app_commerce as commerce
from .commerce_models import AppOrder
from .logistics_models import LogisticsTask, RiderPosition

MOVING = {"collected", "in_transit"}


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0, le=200)
    recorded_at: datetime

    @field_validator("recorded_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("Location time must include timezone")
        return value


def assigned(db, actor, identity):
    task = db.scalar(select(LogisticsTask).where(LogisticsTask.id == identity).with_for_update())
    if not task or task.rider_id != actor.id:
        raise HTTPException(404, "Assigned delivery not found.")
    return task


def publish(db, actor, identity, data):
    task = assigned(db, actor, identity)
    order = db.get(AppOrder, task.order_id)
    if task.status not in MOVING or order.payment_state != "completed" or order.state in {"completed", "cancelled", "review_required"}:
        raise HTTPException(409, "Location sharing is available only for a collected, active delivery.")
    now = datetime.now(UTC)
    captured = commerce.utc(data.recorded_at)
    age = (now - captured).total_seconds()
    if not -15 <= age <= 120:
        raise HTTPException(422, "The location is too old. Wait for a new GPS fix.")
    row = db.get(RiderPosition, identity)
    if row and captured <= commerce.utc(row.recorded_at):
        return {"status": "ignored_older_fix"}
    if not row:
        row = RiderPosition(task_id=identity, rider_id=actor.id)
        db.add(row)
    row.rider_id, row.latitude, row.longitude = actor.id, data.latitude, data.longitude
    row.accuracy, row.recorded_at, row.received_at = data.accuracy, captured, now
    db.commit()
    return {"status": "shared", "received_at": now.isoformat()}


def stop(db, actor, identity):
    assigned(db, actor, identity)
    row = db.get(RiderPosition, identity)
    if row:
        db.delete(row)
    db.commit()


def customer_position(db, task):
    if task.status not in MOVING:
        return None
    row = db.get(RiderPosition, task.id)
    if not row or row.rider_id != task.rider_id:
        return None
    age = (datetime.now(UTC) - commerce.utc(row.recorded_at)).total_seconds()
    # Suppress abandoned locations entirely; short interruptions show a stale marker.
    if age > 900:
        return None
    return {"latitude": row.latitude, "longitude": row.longitude, "accuracy": row.accuracy,
        "recorded_at": commerce.utc(row.recorded_at).isoformat(), "stale": age > 90}
