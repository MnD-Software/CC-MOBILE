"""Run separately: python -m app.notification_worker --loop. No sends unless PUSH_ENABLED=true."""
import argparse
import asyncio
from datetime import UTC, datetime, timedelta
import httpx
from sqlalchemy import select, update
from .config import get_settings
from .db import SessionLocal
from .models import RefreshToken
from .notification_models import AccountNotification, NotificationPreference, PushDevice, PushJob

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"


async def request(url, body):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if get_settings().expo_push_access_token:
        headers["Authorization"] = "Bearer " + get_settings().expo_push_access_token
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        response = await client.post(url, json=body, headers=headers)
        if response.status_code == 429 or response.status_code >= 500:
            raise RuntimeError("transient_provider_error")
        if response.status_code != 200:
            return {"data": {"status": "error", "details": {"error": "provider_configuration_error"}}}
        return response.json()


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def drain(db, limit=50, transport=request):
    if not get_settings().push_enabled:
        return {"enabled": False, "processed": 0}
    processed = 0
    for _ in range(limit):
        now = datetime.now(UTC)
        candidate = db.scalar(select(PushJob.id).where(PushJob.state.in_(["pending", "accepted", "sending", "checking"]),
                                  PushJob.available_at <= now).order_by(PushJob.available_at, PushJob.id).limit(1))
        if not candidate:
            break
        # Atomic lease supports multiple worker processes and crash recovery.
        job = db.scalar(select(PushJob).where(PushJob.id == candidate))
        original_state = job.state
        checking = bool(job.ticket)
        claimed = db.execute(update(PushJob).where(PushJob.id == candidate, PushJob.available_at <= now,
                            PushJob.state == original_state).values(state="checking" if checking else "sending",
                            available_at=now+timedelta(minutes=2), attempts=PushJob.attempts+1)
                            .execution_options(synchronize_session=False)).rowcount
        db.commit()
        if not claimed:
            continue
        db.refresh(job)
        device = db.get(PushDevice, job.device_id, populate_existing=True)
        notification = db.get(AccountNotification, job.notification_id)
        session = db.get(RefreshToken, device.session_hash, populate_existing=True) if device else None
        prefs = db.get(NotificationPreference, notification.customer_id, populate_existing=True) if notification else None
        allowed = (device and notification and device.enabled and device.generation == job.generation
                   and device.customer_id == notification.customer_id and session and not session.revoked
                   and session.customer_id == notification.customer_id and utc(session.expires_at) > now
                   and (not prefs or prefs.order_updates))
        if allowed and notification.data.get('marketing'):
            from .marketing_crm import MarketingConsent
            consent=db.get(MarketingConsent,notification.customer_id)
            allowed=bool(consent and consent.enabled)
            if allowed and notification.kind=='checkout_reminder':
                from .marketing_crm import CheckoutActivity
                activity=db.get(CheckoutActivity,notification.customer_id)
                allowed=not (activity and (activity.payload.get('converted') or not activity.payload.get('product_ids')))
                from .commerce_models import AppOrder
                if db.scalar(select(AppOrder.id).where(AppOrder.customer_id==notification.customer_id,AppOrder.payment_state.in_(['completed','pending','creating','uncertain']),AppOrder.created_at>=notification.created_at).limit(1)):allowed=False
        if not allowed or utc(job.expires_at) <= now:
            job.state, job.error = "cancelled", "expired_or_disabled"
            db.commit()
            processed += 1
            continue
        if not checking and job.attempts > 5:
            job.state, job.error = "failed", "retry_limit"
            db.commit()
            processed += 1
            continue
        try:
            if checking:
                response = await transport(RECEIPTS_URL, {"ids": [job.ticket]})
                result = response.get("data", {}).get(job.ticket)
                if result is None:
                    job.state = "accepted"
                    job.available_at = now+timedelta(minutes=15)
                    db.commit()
                    processed += 1
                    continue
            else:
                response = await transport(SEND_URL, {"to": device.token, "title": notification.title,
                    "body": notification.body, "sound": "default", "channelId": "orders", "ttl": 3600,
                    "data": {**notification.data, "notification_id": notification.id},
                    "collapseId": notification.id})
                result = response.get("data")
                if isinstance(result, list):
                    result = result[0] if len(result) == 1 else None
            if not isinstance(result, dict):
                raise RuntimeError("invalid_provider_response")
            if result.get("status") == "ok":
                if checking:
                    job.state, job.error = "provider_ok", ""
                elif isinstance(result.get("id"), str) and len(result["id"]) <= 80:
                    job.ticket, job.state, job.error = result["id"], "accepted", ""
                    job.attempts = 0
                    job.available_at = now+timedelta(minutes=15)
                else:
                    raise RuntimeError("missing_push_ticket")
            else:
                code = result.get("details", {}).get("error", "provider_rejected")
                if code == "DeviceNotRegistered":
                    db.execute(update(PushDevice).where(PushDevice.id == device.id, PushDevice.generation == job.generation)
                               .values(enabled=False))
                if code == "MessageRateExceeded":
                    raise RuntimeError("rate_limited")
                job.state = "failed"
                # Store known codes only; provider text may contain a device token.
                job.error = code if code in {"DeviceNotRegistered", "MessageTooBig", "InvalidCredentials", "MismatchSenderId", "provider_configuration_error"} else "provider_rejected"
        except (httpx.HTTPError, RuntimeError, ValueError, TypeError, AttributeError):
            job.state = ("accepted" if checking else "pending") if job.attempts < 5 else "failed"
            job.error = "provider_unavailable"
            job.available_at = now+timedelta(seconds=min(3600, 30 * 2 ** job.attempts))
        db.commit()
        processed += 1
    return {"enabled": True, "processed": processed}


async def main(loop):
    from .config import validate_production_settings
    validate_production_settings(get_settings())
    while True:
        with SessionLocal() as db:
            from .marketing_crm import recover
            recover(db)
            print(await drain(db), flush=True)
        if not loop:
            return
        await asyncio.sleep(15)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    asyncio.run(main(parser.parse_args().loop))
