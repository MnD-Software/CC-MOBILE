import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Customer, RefreshToken

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"pbkdf2_sha256$210000${salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, rounds, salt_hex, expected_hex = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds)
        ).hex()
        return hmac.compare_digest(actual, expected_hex)
    except (ValueError, TypeError):
        return False


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_access_token(customer: Customer) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": customer.id, "role": customer.role, "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def create_session(db: Session, customer: Customer) -> dict:
    settings = get_settings()
    raw_refresh = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            token_hash=token_hash(raw_refresh),
            customer_id=customer.id,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
        )
    )
    db.commit()
    return {
        "access_token": create_access_token(customer),
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": settings.access_token_minutes * 60,
        "customer": customer_payload(customer),
    }


def customer_payload(customer: Customer) -> dict:
    return {
        "id": customer.id,
        "email": customer.email,
        "first_name": customer.first_name,
        "last_name": customer.last_name,
        "phone": customer.phone,
        "role": customer.role,
    }


def customer_from_access_token(db: Session, authorization: str | None) -> Customer:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(authorization[7:], get_settings().jwt_secret, algorithms=["HS256"])
        customer_id = payload["sub"]
    except (jwt.PyJWTError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from None
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer not found")
    return customer


def rotate_refresh_token(db: Session, raw_refresh: str) -> dict:
    record = db.get(RefreshToken, token_hash(raw_refresh))
    now = datetime.now(UTC)
    expires_at = record.expires_at if record else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if not record or record.revoked or expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    customer = db.get(Customer, record.customer_id)
    record.revoked = True
    db.commit()
    return create_session(db, customer)
