"""Customer-owned exports and account closure with retained transaction records."""
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, String, delete, select, update
from sqlalchemy.orm import Mapped, mapped_column, Session

from .db import Base, get_db
from .models import Customer, Address, Celebration, Enquiry, RefreshToken, PasswordResetToken, OrganizationMember
from .commerce_models import AppOrder, AppQuote, AppDeliveryQuote, AppCoupon
from .notification_models import AccountNotification, PushDevice, PushJob, NotificationPreference, OrderReview
from .routes_club import member
from .security import verify_password, hash_password, customer_payload
from .permissions import audit


class ClosedAccount(Base):
    __tablename__ = "closed_accounts"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), primary_key=True)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


router = APIRouter(prefix="/v1/account", tags=["account-privacy"])


def rows(db, model, owner, fields):
    records = list(db.scalars(select(model).where(model.customer_id == owner)))
    return [{field: getattr(record, field) for field in fields} for record in records]


@router.get("/export")
def export(response: Response, actor=Depends(member), db: Session = Depends(get_db)):
    from .models import ClubEntry, ClubProfile
    from .compliance import PrivacyRequest,TaxInvoiceRequest
    from .marketing_crm import MarketingConsent,CheckoutActivity
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Content-Disposition"] = 'attachment; filename="cake-city-account.json"'
    return {"version": 1, "exported_at": datetime.now(UTC), "profile": customer_payload(actor),
        "tax_invoice_requests": [{"reference":o.reference,"buyer_pin":r.buyer_pin,"status":r.payload} for r,o in db.execute(select(TaxInvoiceRequest,AppOrder).join(AppOrder,AppOrder.id==TaxInvoiceRequest.order_id).where(AppOrder.customer_id==actor.id))],
        "privacy_requests": rows(db, PrivacyRequest, actor.id, ["id","payload"]),
        "checkout_activity": rows(db, CheckoutActivity, actor.id, ["updated_at","payload"]),
        "marketing_consent": rows(db, MarketingConsent, actor.id, ["enabled","payload"]),
        "addresses": rows(db, Address, actor.id, ["label", "recipient_name", "phone", "line1", "line2", "area", "city", "delivery_notes", "is_default"]),
        "celebrations": rows(db, Celebration, actor.id, ["name", "occasion", "month", "day", "notes"]),
        "orders": rows(db, AppOrder, actor.id, ["reference", "state", "payment_state", "channel", "environment", "snapshot", "total_minor", "subtotal_minor", "discount_minor", "delivery_minor", "created_at", "paid_at"]),
        "requests": rows(db, Enquiry, actor.id, ["id", "kind", "subject", "details", "status", "staff_response", "created_at"]),
        "points_activity": rows(db, ClubEntry, actor.id, ["points", "description", "created_at", "expires_at", "order_id"]),
        "club_profile": rows(db, ClubProfile, actor.id, ["birthday_month", "birthday_day"]),
        "reviews": rows(db, OrderReview, actor.id, ["rating", "comment", "created_at"]),
        "notifications": rows(db, AccountNotification, actor.id, ["kind", "title", "body", "data", "read_at", "created_at"]),
        "notification_preferences": rows(db, NotificationPreference, actor.id, ["order_updates"]),
        "scope": "App account data. Device-local favourites, bag and avatars remain on the device. Separately held ERP, website and corporate records require a support request."}


class Closure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=128)
    confirmation: str = Field(pattern="^DELETE$")


@router.post("/close")
def close(data: Closure, actor=Depends(member), db: Session = Depends(get_db)):
    owner = db.scalar(select(Customer).where(Customer.id == actor.id).with_for_update())
    if not verify_password(data.password, owner.password_hash):
        raise HTTPException(403, "Confirm your current password to delete your account.")
    if owner.role != "customer" or db.scalar(select(OrganizationMember.customer_id).where(OrganizationMember.customer_id == owner.id).limit(1)):
        raise HTTPException(409, "Contact support to close a staff or company-linked account so responsibilities can be transferred.")
    active = db.scalar(select(AppOrder.id).where(AppOrder.customer_id == owner.id,
        ((AppOrder.payment_state.in_(["creating", "pending", "uncertain"])) |
         ((AppOrder.payment_state == "completed") & AppOrder.state.notin_(["completed", "cancelled", "payment_failed"])))).limit(1))
    if active:
        raise HTTPException(409, "An order or payment is still active. Contact order support before deleting your account.")
    if db.get(ClosedAccount, owner.id):
        raise HTTPException(409, "This account is already closed.")
    from . import app_commerce
    for order in db.scalars(select(AppOrder).where(AppOrder.customer_id == owner.id, AppOrder.payment_state == "not_started").with_for_update()):
        if order.inventory_state == "reserved":
            app_commerce.inventory_transition(db, order, paid=False)
        order.payment_state, order.state = "cancelled", "cancelled"
        app_commerce.record_event(db, order, "cancelled_before_account_closure")
    now = datetime.now(UTC)
    db.add(ClosedAccount(customer_id=owner.id, closed_at=now))
    db.execute(update(RefreshToken).where(RefreshToken.customer_id == owner.id).values(revoked=True))
    db.execute(update(PushDevice).where(PushDevice.customer_id == owner.id).values(enabled=False))
    notifications = select(AccountNotification.id).where(AccountNotification.customer_id == owner.id)
    db.execute(delete(PushJob).where(PushJob.notification_id.in_(notifications)))
    db.execute(delete(AccountNotification).where(AccountNotification.customer_id == owner.id))
    from .marketing_crm import MarketingConsent,CheckoutActivity
    for model in [MarketingConsent,CheckoutActivity,Address, Celebration, AppQuote, AppDeliveryQuote, PasswordResetToken, NotificationPreference]:
        db.execute(delete(model).where(model.customer_id == owner.id))
    from .models import ClubProfile
    db.execute(delete(ClubProfile).where(ClubProfile.customer_id == owner.id))
    db.execute(update(AppCoupon).where(AppCoupon.customer_id == owner.id).values(enabled=False))
    # Order/payment/loyalty/support history remains for reconciliation and retention obligations.
    owner.email = f"closed-{owner.id}@deleted.invalid"
    owner.first_name, owner.last_name, owner.phone = "Deleted", "customer", None
    owner.password_hash = hash_password(secrets.token_urlsafe(48))
    audit(db, owner.id, "account_closed", owner.id)
    db.commit()
    return {"status": "closed", "closed_at": now, "retained": "Order, payment, loyalty and support records remain for accounting, disputes and required retention. Saved addresses and celebrations were removed."}
