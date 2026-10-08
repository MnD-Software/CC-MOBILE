"""Render free/paid entry point: validate schema before accepting requests."""
import os
from .migrate import migrate
from .config import get_settings


def main():
    settings = get_settings()
    if settings.environment == "production" and not settings.sqlalchemy_url.startswith("postgresql"):
        raise RuntimeError("Set a persistent PostgreSQL DATABASE_URL before starting the production Club service.")
    migrate()
    workers = str(max(1, min(8, int(os.environ.get("WEB_CONCURRENCY", "1")))))
    os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", os.environ.get("PORT", "8000"), "--workers", workers, "--timeout-keep-alive", "5"])


if __name__ == "__main__":
    main()
