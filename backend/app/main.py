from .marketing_crm import router as marketing_crm_router
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
from .ride_feedback import router as ride_feedback_router
from .routes import router as platform_router
from .routes_auth import router as auth_router
from .routes_addresses import router as addresses_router
from .routes_profile import router as profile_router
from .customer_lifecycle import router as lifecycle_router
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
from .rider_tracking import router as rider_tracking_router
from .release_readiness import router as release_router
from .checkout_coupons import router as checkout_coupons_router
from .promotions import router as promotions_router
from .service_desk import router as service_desk_router
from .compliance import router as compliance_router
from .order_home import router as order_home_router
from .staff_workspace import router as staff_workspace_router
from .concierge import router as concierge_router
from .rider_earnings import router as rider_earnings_router
from .business import router as business_router
from .diy import router as diy_router


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
app.include_router(profile_router)
app.include_router(lifecycle_router)
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
app.include_router(rider_tracking_router)
app.include_router(release_router)
app.include_router(checkout_coupons_router)
app.include_router(promotions_router)
app.include_router(service_desk_router)
app.include_router(compliance_router)
app.include_router(order_home_router)
app.include_router(staff_workspace_router)
app.include_router(notifications_router)
app.include_router(ride_feedback_router)
app.include_router(concierge_router)
app.include_router(rider_earnings_router)
app.include_router(business_router)
app.include_router(diy_router)


@app.get("/ready/db")
def database_ready():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}

app.include_router(marketing_crm_router)
