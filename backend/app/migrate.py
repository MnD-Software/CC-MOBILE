"""Add new tables without dropping existing customer/session data.
Run once before a release; existing incompatible tables fail validation.
"""
from sqlalchemy import inspect
from .db import Base, engine
from . import models


def migrate():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        existing = {column["name"] for column in inspector.get_columns(table.name)}
        missing = set(table.columns.keys()) - existing
        if missing:
            raise RuntimeError(f"Schema migration required for {table.name}: {sorted(missing)}")
    print("Cake City schema is ready; existing records preserved.")


if __name__ == "__main__":
    migrate()
