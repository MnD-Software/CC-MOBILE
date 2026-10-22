from datetime import UTC, datetime, timedelta
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .db import get_db
from .models import Customer, Enquiry, Organization, OrganizationMember, OrganizationInvitation, OrganizationEnquiry
from .permissions import audit
from .routes_club import member
from .routes_enquiries import NewEnquiry, AcceptQuote, output
from .security import token_hash

router = APIRouter(prefix="/v1/corporate", tags=["corporate"])


class OrganizationInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    name: str = Field(min_length=2, max_length=160)
    billing_address: str = Field(min_length=5, max_length=500)
    industry: str = Field(default="", max_length=100)


class InvitationInput(BaseModel):
    email: EmailStr
    role: str = Field(pattern=r"^(approver|buyer|viewer)$")


class InvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=160)


class MemberRole(BaseModel):
    role: str = Field(pattern=r"^(approver|buyer|viewer)$")


def organization_access(db, identity, customer, roles=None):
    membership = db.get(OrganizationMember, (identity, customer.id))
    if not membership:
        raise HTTPException(404, "Organization not found")
    if roles and membership.role not in roles:
        raise HTTPException(403, "Your organization role cannot perform this operation")
    return membership


def organization_output(row, role):
    return {"id": row.id, "name": row.name, "billing_address": row.billing_address,
            "industry": row.industry, "role": role, "credit_enabled": False}


@router.get("/organizations")
def organizations(customer: Customer = Depends(member), db: Session = Depends(get_db)):
    rows = db.execute(select(Organization, OrganizationMember.role).join(OrganizationMember)
                      .where(OrganizationMember.customer_id == customer.id).order_by(Organization.name).limit(100))
    return [organization_output(row, role) for row, role in rows]


@router.post("/organizations", status_code=201)
def register(data: OrganizationInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    # An atomic customer-row write serializes retries on SQLite and PostgreSQL.
    db.execute(update(Customer).where(Customer.id == customer.id).values(first_name=Customer.first_name))
    old = db.scalar(select(Organization).where(Organization.owner_id == customer.id, Organization.request_key == data.request_key))
    if old:
        if (old.name, old.billing_address, old.industry) != (data.name, data.billing_address, data.industry):
            raise HTTPException(409, "Request key already used for different organization details")
        return organization_output(old, "owner")
    row = Organization(id=str(uuid4()), owner_id=customer.id, **data.model_dump())
    db.add(row)
    db.flush()
    db.add(OrganizationMember(organization_id=row.id, customer_id=customer.id, role="owner"))
    audit(db, customer.id, "organization.created", row.id, row.id)
    db.commit()
    return organization_output(row, "owner")


@router.get("/organizations/{identity}/members")
def members(identity: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    organization_access(db, identity, customer, {"owner", "approver"})
    return [{"customer_id": row.customer_id, "role": row.role, "department": row.department,
             "name": " ".join((person.first_name, person.last_name)).strip()}
            for row, person in db.execute(select(OrganizationMember, Customer).join(Customer)
                .where(OrganizationMember.organization_id == identity))]


@router.post("/organizations/{identity}/invitations", status_code=201)
def invite(identity: str, data: InvitationInput, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    organization_access(db, identity, customer, {"owner"})
    token = secrets.token_urlsafe(48)
    expiry = datetime.now(UTC) + timedelta(days=3)
    db.add(OrganizationInvitation(token_hash=token_hash(token), organization_id=identity,
                                  email=str(data.email).lower(), role=data.role, expires_at=expiry))
    audit(db, customer.id, "organization.invited", identity, identity, role=data.role)
    db.commit()
    # Owner shares privately; no claim that email was delivered. Response is no-store.
    return {"token": token, "expires_at": expiry, "delivery": "manual_private_share"}


@router.put("/organizations/{identity}/members/{customer_id}")
def change_role(identity: str, customer_id: str, data: MemberRole, actor: Customer = Depends(member), db: Session = Depends(get_db)):
    organization_access(db, identity, actor, {"owner"})
    db.execute(update(Organization).where(Organization.id == identity).values(name=Organization.name))
    target = db.get(OrganizationMember, (identity, customer_id))
    if not target:
        raise HTTPException(404, "Member not found")
    if target.role == "owner":
        raise HTTPException(409, "Ownership cannot be changed through member permissions")
    target.role = data.role
    audit(db, actor.id, "organization.role_changed", customer_id, identity, role=data.role)
    db.commit()
    return {"customer_id": customer_id, "role": data.role}


@router.delete("/organizations/{identity}/members/{customer_id}", status_code=204)
def remove_member(identity: str, customer_id: str, actor: Customer = Depends(member), db: Session = Depends(get_db)):
    organization_access(db, identity, actor, {"owner"})
    db.execute(update(Organization).where(Organization.id == identity).values(name=Organization.name))
    target = db.get(OrganizationMember, (identity, customer_id))
    if not target:
        raise HTTPException(404, "Member not found")
    if target.role == "owner":
        raise HTTPException(409, "Company owner cannot be removed")
    db.delete(target)
    audit(db, actor.id, "organization.member_removed", customer_id, identity)
    db.commit()


@router.post("/invitations/accept")
def join(data: InvitationAccept, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    invitation = db.get(OrganizationInvitation, token_hash(data.token))
    if not invitation or invitation.email != customer.email.lower():
        raise HTTPException(404, "Invitation not found")
    db.execute(update(Organization).where(Organization.id == invitation.organization_id).values(name=Organization.name))
    db.refresh(invitation)
    expiry = invitation.expires_at.replace(tzinfo=UTC) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if invitation.accepted or expiry <= datetime.now(UTC):
        raise HTTPException(409, "Invitation expired or already accepted")
    if db.get(OrganizationMember, (invitation.organization_id, customer.id)):
        raise HTTPException(409, "Already a member; invitations cannot change existing roles")
    db.add(OrganizationMember(organization_id=invitation.organization_id, customer_id=customer.id, role=invitation.role))
    invitation.accepted = True
    audit(db, customer.id, "organization.joined", invitation.organization_id, invitation.organization_id, role=invitation.role)
    db.commit()
    return {"organization_id": invitation.organization_id, "role": invitation.role}


@router.get("/organizations/{identity}/quotes")
def quotes(identity: str, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    organization_access(db, identity, customer)
    return [output(row) for row in db.scalars(select(Enquiry).join(OrganizationEnquiry)
            .where(OrganizationEnquiry.organization_id == identity).order_by(Enquiry.created_at.desc()).limit(100))]


@router.post("/organizations/{identity}/quotes", status_code=201)
def request_quote(identity: str, data: NewEnquiry, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    db.execute(update(Organization).where(Organization.id == identity).values(name=Organization.name))
    organization_access(db, identity, customer, {"owner", "approver", "buyer"})
    if data.kind != "corporate":
        raise HTTPException(422, "Corporate requests must use corporate kind")
    db.execute(update(Customer).where(Customer.id == customer.id).values(first_name=Customer.first_name))
    old = db.scalar(select(Enquiry).where(Enquiry.customer_id == customer.id, Enquiry.request_key == data.request_key))
    if old:
        link = db.get(OrganizationEnquiry, old.id)
        if not link or link.organization_id != identity or (old.subject, old.details) != (data.subject, data.details):
            raise HTTPException(409, "Request key already used")
        return output(old)
    row = Enquiry(id=str(uuid4()), customer_id=customer.id, **data.model_dump())
    db.add(row)
    db.flush()
    db.add(OrganizationEnquiry(enquiry_id=row.id, organization_id=identity))
    audit(db, customer.id, "corporate.quote_requested", row.id, identity)
    db.commit()
    return output(row)


@router.post("/organizations/{identity}/quotes/{quote_id}/accept")
def accept_quote(identity: str, quote_id: str, data: AcceptQuote, customer: Customer = Depends(member), db: Session = Depends(get_db)):
    db.execute(update(Organization).where(Organization.id == identity).values(name=Organization.name))
    organization_access(db, identity, customer, {"owner", "approver"})
    link = db.get(OrganizationEnquiry, quote_id)
    if not link or link.organization_id != identity:
        raise HTTPException(404, "Quote not found")
    row = db.get(Enquiry, quote_id)
    if row.status == "accepted" and row.revision == data.revision + 1:
        return output(row)
    changed = db.execute(update(Enquiry).where(Enquiry.id == quote_id, Enquiry.status == "quoted",
                         Enquiry.revision == data.revision, Enquiry.quote_expires_at > datetime.now(UTC))
                         .values(status="accepted", revision=Enquiry.revision + 1).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        db.rollback()
        db.refresh(row)
        if row.status == "accepted" and row.revision == data.revision + 1:
            return output(row)
        raise HTTPException(409, "Quote changed or expired")
    audit(db, customer.id, "corporate.quote_accepted", quote_id, identity, revision=data.revision)
    db.commit()
    db.refresh(row)
    return output(row)
