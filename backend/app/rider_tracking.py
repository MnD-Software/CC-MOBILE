"""Revocable, trip-only location credentials for native background delivery tracking."""
import secrets
from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, String, select, update
from sqlalchemy.orm import Mapped, mapped_column, Session
from .db import Base, get_db
from .models import Customer, RefreshToken
from .routes_logistics import rider
from .live_tracking import Position, assigned, publish, stop, MOVING
from .security import token_hash
from .app_commerce import utc


class TrackingGrant(Base):
    __tablename__ = "rider_tracking_grants"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("logistics_tasks.id"), index=True)
    session_hash: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


router = APIRouter(tags=["rider-background-location"])


class StartTracking(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)


@router.post("/v1/rider/tasks/{identity}/tracking-session")
def start(identity: str, data: StartTracking, response: Response, actor=Depends(rider), db: Session = Depends(get_db)):
    task = assigned(db, actor, identity)
    if task.status not in MOVING:
        raise HTTPException(409, "Collect the cake before sharing delivery location.")
    session = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(data.refresh_token)).with_for_update())
    if not session or session.customer_id != actor.id or session.revoked or utc(session.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "Sign in again before sharing location.")
    # One active background trip per rider; starting another invalidates old credentials.
    from sqlalchemy import delete
    db.execute(delete(TrackingGrant).where(TrackingGrant.customer_id == actor.id))
    raw = secrets.token_urlsafe(48)
    expiry = min(datetime.now(UTC) + timedelta(hours=8), utc(session.expires_at))
    db.add(TrackingGrant(token_hash=token_hash(raw), customer_id=actor.id, task_id=identity, session_hash=session.token_hash, expires_at=expiry))
    db.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return {"token": raw, "expires_at": expiry}


def credential(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    raw = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    grant = db.get(TrackingGrant, token_hash(raw)) if raw else None
    now = datetime.now(UTC)
    if not grant or utc(grant.expires_at) <= now:
        raise HTTPException(401, "Delivery sharing has expired. Start it again from your rider screen.")
    session = db.get(RefreshToken, grant.session_hash)
    actor = db.get(Customer, grant.customer_id)
    if not session or session.revoked or utc(session.expires_at) <= now or not actor or actor.role not in {"rider", "driver"}:
        raise HTTPException(401, "Delivery sharing is no longer authorized.")
    return grant, actor


@router.put("/v1/rider/tracking/location")
def location(data: Position, context=Depends(credential), db: Session = Depends(get_db)):
    grant, actor = context
    return publish(db, actor, grant.task_id, data)


@router.delete("/v1/rider/tracking/location", status_code=204)
def end(context=Depends(credential), db: Session = Depends(get_db)):
    grant, actor = context
    stop(db, actor, grant.task_id)
    db.delete(grant)
    db.commit()
