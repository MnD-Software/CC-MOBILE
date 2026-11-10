from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings, validate_production_settings
from .catalogue import catalogue
from .middleware import RequestTelemetry, SharedRateLimit
from .db import Base, engine
from . import commerce_models
from . import odoo_models
from . import logistics_models
from . import notification_models
from . import club_celebrations
from .routes_notifications import router as notifications_router
from .routes import router as platform_router
from .routes_auth import router as auth_router
from .routes_addresses import router as addresses_router
from .routes_tracking import router as tracking_router
from .routes_club import router as club_router
from .routes_club_benefits import router as club_benefits_router
from .routes_club_wallet import router as club_wallet_router
from .routes_woo_club import router as woo_club_router
from .routes_enquiries import router as enquiries_router
from .routes_celebrations import router as celebrations_router
from .routes_content import router as content_router
from .routes_corporate import router as corporate_router
from .routes_workspace import router as workspace_router
from .routes_pesapal import router as pesapal_router
from .app_catalogue import router as app_catalogue_router
from .routes_app_admin import router as app_admin_router
from .routes_dashboard import router as dashboard_router
from .routes_app_delivery import router as delivery_router
from .routes_odoo import router as odoo_router
from .routes_logistics import router as logistics_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_production_settings(get_settings())
    if get_settings().environment.casefold() != "production":
        Base.metadata.create_all(bind=engine)
    await catalogue.start()
    try:
        yield
    finally:
        await catalogue.close()


settings = get_settings()
app = FastAPI(title="Cake City API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SharedRateLimit)
app.add_middleware(RequestTelemetry)
app.include_router(platform_router)
app.include_router(auth_router)
app.include_router(addresses_router)
# Legacy website order tracking is not part of the independent app runtime.
app.include_router(club_router)
app.include_router(club_benefits_router)
app.include_router(club_wallet_router)
# Website sales enter through the separate signed channel-sales ingestion boundary.
app.include_router(enquiries_router)
app.include_router(celebrations_router)
app.include_router(content_router)
app.include_router(corporate_router)
app.include_router(workspace_router)
app.include_router(pesapal_router)
app.include_router(app_catalogue_router)
app.include_router(app_admin_router)
app.include_router(dashboard_router)
app.include_router(delivery_router)
app.include_router(odoo_router)
app.include_router(logistics_router)
app.include_router(notifications_router)


@app.get("/ready/db")
def database_ready():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
