from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class CustomerResponse(BaseModel):
    id: str
    email: EmailStr
    first_name: str
    last_name: str
    phone: str | None
    role: str


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"]
    expires_in: int
    customer: CustomerResponse


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class GoogleRequest(BaseModel):
    id_token: str = Field(min_length=20)


class CampaignResponse(BaseModel):
    id: str
    title: str
    description: str
    starts_at: datetime
    ends_at: datetime
    app_exclusive: bool = True
    eligible: bool = True
    minimum_order: float = 0
    branch_ids: list[str] = []
    product_slugs: list[str] = []
    category_ids: list[int] = []
    usage_remaining: int | None = None
    discount_type: Literal["percentage", "fixed", "delivery", "bundle"] = "bundle"
    discount_value: float = 0


class MobileConfigResponse(BaseModel):
    checkout_contract: str
    capabilities: dict[str, bool]
    branches: list[dict] = []
    campaigns: list[CampaignResponse] = []
    studio: dict | None = None
