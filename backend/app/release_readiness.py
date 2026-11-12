"""Private setup diagnosis. Read-only: does not submit orders or contact providers."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .config import get_settings
from .db import get_db
from .routes_app_admin import operator
from .notification_models import PushDevice, PushJob
from .pesapal import configured

router = APIRouter(tags=["release-operations"])


@router.get("/v1/admin/release-readiness")
def readiness(actor=Depends(operator), db: Session = Depends(get_db)):
    settings = get_settings()
    smtp = all([settings.smtp_host, settings.smtp_sender_email, settings.smtp_username, settings.smtp_password])
    return {"payments_configured": configured(), "password_recovery_enabled": settings.password_recovery_enabled,
        "smtp_configured": smtp, "push_enabled": settings.push_enabled,
        "registered_push_devices": db.scalar(select(func.count()).select_from(PushDevice).where(PushDevice.enabled.is_(True))),
        "push_jobs": dict(db.execute(select(PushJob.state, func.count()).group_by(PushJob.state)).all()),
        "background_tracking_api": True, "account_export_and_closure": True,
        "ai_enabled": settings.concierge_enabled, "checks_do_not_charge": True,
        "device_acceptance_required": True}
