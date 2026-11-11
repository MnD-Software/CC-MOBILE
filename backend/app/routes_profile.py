"""Self-service contact details; identity, credentials and roles are not editable here."""
import re
import unicodedata

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer
from .permissions import audit
from .routes_club import member
from .schemas import CustomerResponse
from .security import customer_payload

router = APIRouter(prefix="/v1/account", tags=["customer-profile"])


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(max_length=40)

    @field_validator("first_name", "last_name")
    @classmethod
    def readable_name(cls, value):
        if any(unicodedata.category(char).startswith("C") for char in value):
            raise ValueError("Enter a name without control characters")
        return value

    @field_validator("phone")
    @classmethod
    def contact_phone(cls, value):
        if not value:
            return None
        value = re.sub(r"\s", "", value)
        if not re.fullmatch(r"(?:\+?254|0)[17][0-9]{8}", value):
            raise ValueError("Enter a valid Kenyan phone number, or leave it blank")
        return value


@router.get("/profile", response_model=CustomerResponse)
def profile(response: Response, customer: Customer = Depends(member)):
    response.headers["Cache-Control"] = "private, no-store"
    return customer_payload(customer)


@router.put("/profile", response_model=CustomerResponse)
def update_profile(data: ProfileInput, response: Response, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    changes = data.model_dump()
    for key, value in changes.items():
        setattr(customer, key, value)
    audit(db, customer.id, "customer_profile_updated", customer.id, fields=list(changes))
    db.commit()
    db.refresh(customer)
    return customer_payload(customer)
