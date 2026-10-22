"""Operator-only preview factory. Never mounted or imported by production startup."""
import json
import os
from pathlib import Path
from uuid import uuid4


def create_app():
    directory = Path(os.environ.get("CAKECITY_LOCAL_PREVIEW_DIR", "")).resolve()
    expected = Path(__file__).resolve().parents[2] / "artifacts" / "local-preview"
    database_url = "sqlite:///" + (directory / "review.db").as_posix()
    if directory != expected.resolve() or os.environ.get("ENVIRONMENT") != "development":
        raise RuntimeError("Local preview requires its dedicated artifacts directory and development environment")
    if os.environ.get("DATABASE_URL") != database_url:
        raise RuntimeError("Local preview cannot use another database")
    # Explicit blanks prevent .env configuration from supplying production adapters.
    for key in ("WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET", "CLUB_EVENT_SECRET",
                "WOOCOMMERCE_WEBHOOK_SECRET", "REDIS_URL"):
        if os.environ.get(key) != "":
            raise RuntimeError("Live integration credentials are forbidden in the local preview")

    from .config import get_settings
    from .db import Base, SessionLocal, engine
    from .main import app
    from .models import Customer
    from .security import hash_password
    from sqlalchemy import select

    if get_settings().sqlalchemy_url != database_url:
        raise RuntimeError("Local preview settings were initialized for a different database")
    credentials = json.loads((directory / "credentials.json").read_text(encoding="utf-8"))
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for role, identity in credentials["accounts"].items():
            customer = db.scalar(select(Customer).where(Customer.email == identity["email"]))
            if not customer:
                customer = Customer(id=str(uuid4()), email=identity["email"],
                                    first_name="Local", last_name="Reviewer", role=role,
                                    password_hash=hash_password(identity["password"]))
                db.add(customer)
        db.commit()

    @app.get("/local-preview/status", include_in_schema=False)
    def status():
        return {"local_preview": True, "database": "isolated", "live_integrations": False}

    return app
