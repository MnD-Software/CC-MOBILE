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
    if os.environ.get("APP_PUBLIC_URL") != "http://127.0.0.1:8010":
        raise RuntimeError("Live integration credentials are forbidden in the local preview; use its local media origin")
    # Explicit blanks prevent .env configuration from supplying production adapters.
    for key in ("WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET", "CLUB_EVENT_SECRET",
                "WOOCOMMERCE_WEBHOOK_SECRET", "REDIS_URL", "PESAPAL_CONSUMER_KEY",
                "PESAPAL_CONSUMER_SECRET", "PESAPAL_ACCOUNTS_JSON", "PESAPAL_PUBLIC_URL",
                "RENDER_EXTERNAL_URL", "SALES_INGEST_SECRET",
                "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_BROWSER_KEY"):
        if os.environ.get(key) != "":
            raise RuntimeError("Live integration credentials are forbidden in the local preview")
    if (os.environ.get("ODOO_ENABLED", "false").lower() != "false"
            or os.environ.get("ODOO_LOYALTY_AUTHORITY", "false").lower() != "false"
            or any(os.environ.get(key) for key in ("ODOO_URL", "ODOO_DATABASE", "ODOO_API_KEY", "ODOO_WEBHOOK_SECRET"))):
        raise RuntimeError("Odoo integrations are forbidden in the isolated local preview")

    from .config import get_settings
    from .db import Base, SessionLocal, engine
    from .main import app
    from .models import Customer
    from .security import hash_password
    from sqlalchemy import select

    if get_settings().sqlalchemy_url != database_url:
        raise RuntimeError("Local preview settings were initialized for a different database")
    if get_settings().app_public_url != "http://127.0.0.1:8010":
        raise RuntimeError("Local preview settings were initialized for a different media origin")
    if get_settings().odoo_enabled or get_settings().odoo_loyalty_authority or get_settings().odoo_api_key:
        raise RuntimeError("Odoo integrations are forbidden in the isolated local preview")
    if get_settings().push_enabled or get_settings().expo_push_access_token:
        raise RuntimeError("Remote push delivery is forbidden in the isolated local preview")
    if get_settings().concierge_enabled or get_settings().openai_api_key:
        raise RuntimeError("Paid AI provider calls are forbidden in the isolated local preview")
    if any(getattr(get_settings(), key) for key in (
        "pesapal_consumer_key", "pesapal_consumer_secret", "pesapal_accounts_json",
        "pesapal_public_url", "render_external_url", "sales_ingest_secret",
        "google_maps_api_key", "google_maps_browser_key", "woocommerce_consumer_key",
        "woocommerce_consumer_secret", "club_event_secret", "woocommerce_webhook_secret", "redis_url",
    )):
        raise RuntimeError("Live integration credentials are forbidden in the local preview")
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
