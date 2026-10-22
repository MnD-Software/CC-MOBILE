"""Server role decisions use the current database role, never client JWT roles."""
from uuid import uuid4
from fastapi import Depends, HTTPException
from .models import AdministrativeEvent, Customer
from .routes_club import member

ROLE_PERMISSIONS = {
    "admin": {"content.read", "content.write", "enquiries.read", "enquiries.write", "audit.read"},
    "staff": {"content.read", "content.write", "enquiries.read", "enquiries.write"},
    "executive": {"content.read", "audit.read"},
    "marketing_manager": {"content.read", "content.write"},
    "ecommerce_manager": {"content.read", "content.write", "enquiries.read", "enquiries.write"},
    "corporate_sales": {"enquiries.read", "enquiries.write"},
    "sales": {"enquiries.read", "enquiries.write"},
    "customer_service": {"enquiries.read", "enquiries.write"},
    "finance": {"audit.read"},
    "branch_manager": set(),
    "production": set(),
    "dispatch": set(),
    "content_manager": {"content.read", "content.write"},
    "analyst": {"content.read"},
}


def require(permission: str):
    def check(customer: Customer = Depends(member)):
        if permission not in ROLE_PERMISSIONS.get(customer.role, set()):
            raise HTTPException(403, "This role does not have permission for this operation")
        return customer
    return check


def audit(db, actor_id: str, action: str, resource_id: str, scope_id=None, **details):
    # Store operational metadata only, never raw invitation tokens/contact data.
    db.add(AdministrativeEvent(id=str(uuid4()), actor_id=actor_id, action=action,
                              resource_id=resource_id, scope_id=scope_id, details=details))
