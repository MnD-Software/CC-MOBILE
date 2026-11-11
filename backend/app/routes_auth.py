from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Customer, PasswordResetToken, RefreshToken
from .password_recovery import issue_reset_token, send_reset_email
from .schemas import (
    ForgotPasswordRequest,
    GoogleRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SessionResponse,
)
from .security import (
    create_session,
    customer_payload,
    hash_password,
    rotate_refresh_token,
    token_hash,
    verify_password,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def get_by_email(db: Session, email: str) -> Customer | None:
    return db.scalar(select(Customer).where(Customer.email == email.lower()))


def issue_session(db: Session, customer: Customer) -> SessionResponse:
    return SessionResponse.model_validate(create_session(db, customer))


@router.post("/mobile/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if get_by_email(db, email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    customer = Customer(
        id=str(uuid4()),
        email=email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone,
    )
    db.add(customer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from None
    db.refresh(customer)
    return issue_session(db, customer)


@router.post("/mobile/login", response_model=SessionResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    customer = get_by_email(db, str(payload.email).lower())
    if not customer or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return issue_session(db, customer)


@router.post("/mobile/refresh", response_model=SessionResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    return rotate_refresh_token(db, payload.refresh_token)


@router.post("/mobile/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    record = db.get(RefreshToken, token_hash(payload.refresh_token))
    if record:
        record.revoked = True
        from .notification_models import PushDevice
        from sqlalchemy import update
        db.execute(update(PushDevice).where(PushDevice.session_hash == record.token_hash).values(enabled=False))
        db.commit()
    return None


@router.post("/mobile/google", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def google(_: GoogleRequest):
    raise HTTPException(status_code=501, detail="Google sign-in is not configured")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.password_recovery_enabled:
        raise HTTPException(status_code=503, detail="Password recovery is temporarily unavailable.")
    customer = get_by_email(db, str(payload.email).lower())
    if customer:
        issued = issue_reset_token(db, customer)
        if issued:
            raw_token, digest = issued
            background_tasks.add_task(send_reset_email, customer.email, raw_token, digest)
    return {"message": "If an account matches this email, a reset link is on its way."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    customer_id = db.scalar(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == token_hash(payload.token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(PasswordResetToken.customer_id)
        .execution_options(synchronize_session=False)
    )
    if not customer_id:
        db.rollback()
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired.")

    customer = db.get(Customer, customer_id)
    if not customer:
        db.rollback()
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired.")

    refresh_hashes = list(
        db.scalars(select(RefreshToken.token_hash).where(RefreshToken.customer_id == customer_id))
    )
    customer.password_hash = hash_password(payload.password)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.customer_id == customer_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    from .notification_models import PushDevice

    if refresh_hashes:
        db.execute(
            update(PushDevice)
            .where(PushDevice.session_hash.in_(refresh_hashes))
            .values(enabled=False)
        )
    db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.customer_id == customer_id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    db.commit()
    return None
