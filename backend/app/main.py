from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .catalogue import catalogue
from .middleware import RequestTelemetry, SharedRateLimit
from .db import Base, engine
from .routes import router as platform_router
from .routes_auth import router as auth_router
from .routes_tracking import router as tracking_router
from .routes_club import router as club_router
from .routes_club_benefits import router as club_benefits_router
from .routes_club_wallet import router as club_wallet_router
from .routes_woo_club import router as woo_club_router
from .routes_enquiries import router as enquiries_router
from .routes_celebrations import router as celebrations_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    if get_settings().environment != "production":
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
app.include_router(tracking_router)
app.include_router(club_router)
app.include_router(club_benefits_router)
app.include_router(club_wallet_router)
app.include_router(woo_club_router)
app.include_router(enquiries_router)
app.include_router(celebrations_router)


@app.get("/ready/db")
def database_ready():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
