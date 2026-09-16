from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer, RefreshToken
from .schemas import GoogleRequest, LoginRequest, RefreshRequest, RegisterRequest, SessionResponse
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
    db.commit()
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
        db.commit()
    return None


@router.post("/mobile/google", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def google(_: GoogleRequest):
    raise HTTPException(status_code=501, detail="Google sign-in is not configured")


@router.post("/forgot-password", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def forgot_password():
    raise HTTPException(status_code=501, detail="Password recovery email delivery is not configured")


@router.post("/reset-password", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def reset_password():
    raise HTTPException(status_code=501, detail="Password recovery is not configured")
