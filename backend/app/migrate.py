"""Add new tables without dropping existing customer/session data.
Run once before a release; existing incompatible tables fail validation.
"""
from sqlalchemy import inspect, update, select
from sqlalchemy.orm import Session
from .db import Base, engine
from . import models
from . import commerce_models
from . import odoo_models
from . import logistics_models
from . import notification_models
from . import club_celebrations
from . import concierge
from . import customer_lifecycle
from . import routes_enquiries
from . import rider_tracking
from . import order_home


def repair_catalogue_parents(bind=engine):
    # Woo's parent=0 means "no parent". App category browsing uses SQL NULL.
    # Change only that sentinel; preserve prices, inventory and all other data.
    with bind.begin() as connection:
        result = connection.execute(update(commerce_models.AppProduct)
            .where(commerce_models.AppProduct.parent_id == 0).values(parent_id=None))
        return result.rowcount


def configure_made_to_order(bind=engine):
    """Adopt the owner's made-to-order model; retain explicit admin decisions."""
    changed = 0
    with Session(bind) as db:
        rows = db.scalars(select(commerce_models.AppProduct).where(
            commerce_models.AppProduct.payload["order_mode"].as_string().is_(None)).with_for_update()).all()
        for row in rows:
            row.payload = {**row.payload, "order_mode": "made_to_order"}
            if row.revision == 1 and row.allocation == row.reserved == row.sold == 0:
                row.enabled = bool(row.price_minor and row.price_minor > 0 and row.payload.get("is_purchasable", True))
            row.revision += 1
            changed += 1
        db.commit()
    return changed


def migrate():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        existing = {column["name"] for column in inspector.get_columns(table.name)}
        missing = set(table.columns.keys()) - existing
        if missing:
            raise RuntimeError(f"Schema migration required for {table.name}: {sorted(missing)}")
    repaired = repair_catalogue_parents()
    if repaired:
        print(f"Restored {repaired} main products to app category browsing.")
    configured = configure_made_to_order()
    if configured:
        print(f"Configured {configured} catalogue records for made-to-order purchasing.")
    print("Cake City schema is ready; existing records preserved.")


if __name__ == "__main__":
    migrate()
