"""Add new tables without dropping existing customer/session data.
Run once before a release; existing incompatible tables fail validation.
"""
from sqlalchemy import inspect, update
from .db import Base, engine
from . import models
from . import commerce_models


def repair_catalogue_parents(bind=engine):
    # Woo's parent=0 means "no parent". App category browsing uses SQL NULL.
    # Change only that sentinel; preserve prices, inventory and all other data.
    with bind.begin() as connection:
        result = connection.execute(update(commerce_models.AppProduct)
            .where(commerce_models.AppProduct.parent_id == 0).values(parent_id=None))
        return result.rowcount


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
    print("Cake City schema is ready; existing records preserved.")


if __name__ == "__main__":
    migrate()
