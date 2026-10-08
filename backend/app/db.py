from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
options = {"pool_pre_ping": True}
if not settings.sqlalchemy_url.startswith("sqlite"):
    options.update(pool_size=settings.database_pool_size, max_overflow=settings.database_max_overflow, pool_timeout=10)
engine = create_engine(settings.sqlalchemy_url, **options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
