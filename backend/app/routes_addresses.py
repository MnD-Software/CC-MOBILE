import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .db import get_db
from .models import Address, Customer
from .routes_club import member

router = APIRouter(tags=["addresses"])


class AddressInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    label: str = Field(min_length=1, max_length=80)
    recipient_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=9, max_length=40)
    line1: str = Field(min_length=3, max_length=200)
    line2: str | None = Field(default="", max_length=200)
    area: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=100)
    delivery_notes: str | None = Field(default="", max_length=500)
    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def phone_format(cls, value):
        value = re.sub(r"\s", "", value)
        if not re.fullmatch(r"(?:\+?254|0)[17]\d{8}", value):
            raise ValueError("Enter a valid Kenyan phone number")
        return value


def output(record):
    return {"id": record.id, **{key: getattr(record, key) for key in AddressInput.model_fields}}


def lock_owner(db, customer_id):
    db.execute(update(Customer).where(Customer.id == customer_id).values(role=Customer.role))


@router.get("/v1/account/addresses")
def list_addresses(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    values = db.scalars(select(Address).where(Address.customer_id == customer.id)
        .order_by(Address.is_default.desc(), Address.label, Address.id).limit(50)).all()
    return [output(value) for value in values]


def store(body, customer, db, address_id=None):
    lock_owner(db, customer.id)
    existing = db.scalars(select(Address).where(Address.customer_id == customer.id)).all()
    record = next((value for value in existing if value.id == address_id), None)
    if address_id and not record:
        raise HTTPException(404, "Address not found")
    if not record:
        if len(existing) >= 50:
            raise HTTPException(409, "Your address book is full")
        record = Address(id=str(uuid4()), customer_id=customer.id)
        db.add(record)
    # Serialize default selection per owner so simultaneous saves cannot
    # create two defaults. Keep an existing default when editing its details.
    make_default = body.is_default or not existing or (record.is_default and not any(x.is_default and x.id != record.id for x in existing))
    if make_default:
        for value in existing:
            value.is_default = False
    for key, value in body.model_dump().items():
        setattr(record, key, value)
    record.is_default = bool(make_default)
    db.flush()
    result = output(record)
    db.commit()
    return result


@router.post("/v1/account/addresses", status_code=201)
def create_address(body: AddressInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return store(body, customer, db)


@router.put("/v1/account/addresses/{address_id}")
def update_address(address_id: str, body: AddressInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    return store(body, customer, db, address_id)


@router.delete("/v1/account/addresses/{address_id}", status_code=204)
def delete_address(address_id: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    lock_owner(db, customer.id)
    record = db.scalar(select(Address).where(Address.id == address_id, Address.customer_id == customer.id))
    if not record:
        raise HTTPException(404, "Address not found")
    was_default = record.is_default
    db.delete(record)
    db.flush()
    if was_default:
        replacement = db.scalar(select(Address).where(Address.customer_id == customer.id).order_by(Address.label, Address.id).limit(1))
        if replacement:
            replacement.is_default = True
    db.commit()
