import logging
import secrets
import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from urllib.parse import quote

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .models import Customer, PasswordResetToken
from .security import token_hash

logger = logging.getLogger("cakecity.password_recovery")
RESET_LIFETIME = timedelta(minutes=30)
RESET_COOLDOWN = timedelta(minutes=15)
RESET_URI = "cakecity://reset-password"


def issue_reset_token(db: Session, customer: Customer) -> tuple[str, str] | None:
    db.scalar(
        select(Customer.id)
        .where(Customer.id == customer.id)
        .with_for_update()
    )
    now = datetime.now(UTC)
    db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.expires_at <= now)
    )
    recent = db.scalar(
        select(PasswordResetToken.token_hash)
        .where(
            PasswordResetToken.customer_id == customer.id,
            PasswordResetToken.created_at >= now - RESET_COOLDOWN,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .limit(1)
    )
    if recent:
        return None

    db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.customer_id == customer.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw_token = secrets.token_urlsafe(32)
    digest = token_hash(raw_token)
    db.add(
        PasswordResetToken(
            token_hash=digest,
            customer_id=customer.id,
            expires_at=now + RESET_LIFETIME,
        )
    )
    db.commit()
    return raw_token, digest


def send_reset_email(email: str, raw_token: str, digest: str) -> None:
    settings = get_settings()
    try:
        message = EmailMessage()
        message["Subject"] = "Reset your Cake City password"
        message["From"] = f"{settings.smtp_sender_name} <{settings.smtp_sender_email}>"
        message["To"] = email
        link = f"{RESET_URI}?token={quote(raw_token, safe='')}"
        message.set_content(
            "We received a request to reset the password for your Cake City account.\n\n"
            f"Open this link within 30 minutes to choose a new password:\n{link}\n\n"
            "If you did not request this, you can ignore this email."
        )
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        ) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError) as error:
        logger.error(
            "password_reset_email_failed recipient_fingerprint=%s error_type=%s",
            digest[:16],
            type(error).__name__,
        )
        with SessionLocal() as db:
            db.execute(
                update(PasswordResetToken)
                .where(
                    PasswordResetToken.token_hash == digest,
                    PasswordResetToken.used_at.is_(None),
                )
                .values(used_at=datetime.now(UTC))
            )
            db.commit()
