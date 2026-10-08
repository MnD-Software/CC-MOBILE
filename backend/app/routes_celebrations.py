from datetime import date
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .db import get_db
from .models import Celebration, Customer
from .routes_club import member

router = APIRouter(prefix="/v1/account/celebrations", tags=["celebrations"])


class CelebrationInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    occasion: Literal["birthday", "anniversary", "other"] = "birthday"
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    notes: str = Field(default="", max_length=400)

    @model_validator(mode="after")
    def valid_date(self):
        date(2000, self.month, self.day)
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("A name is required")
        return self


def payload(record):
    return {key: getattr(record, key) for key in ("id", "name", "occasion", "month", "day", "notes")}


@router.get("")
def list_celebrations(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    records = db.scalars(select(Celebration).where(Celebration.customer_id == customer.id)
        .order_by(Celebration.month, Celebration.day).limit(100)).all()
    return [payload(record) for record in records]


@router.post("", status_code=201)
def create_celebration(data: CelebrationInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    from .routes_club import account
    account(db, customer.id)
    count = db.scalar(select(func.count()).select_from(Celebration).where(Celebration.customer_id == customer.id))
    if count >= 100:
        raise HTTPException(409, "You can save up to 100 celebrations")
    record = Celebration(id=str(uuid4()), customer_id=customer.id, **data.model_dump())
    db.add(record)
    db.commit()
    return payload(record)


@router.delete("/{identity}", status_code=204)
def delete_celebration(identity: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    record = db.scalar(select(Celebration).where(Celebration.id == identity, Celebration.customer_id == customer.id))
    if not record:
        raise HTTPException(404, "Celebration not found")
    db.delete(record)
    db.commit()
