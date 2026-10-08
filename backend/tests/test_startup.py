import pytest
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Customer
from app import start
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def test_startup_preserves_existing_customer_before_launching_worker(client, monkeypatch):
    response = client.post("/v1/auth/mobile/register", json={
        "email": "startup-preservation@example.com", "password": "StrongPassword123!",
        "first_name": "Start", "last_name": "Test", "phone": "+254712345678",
    })
    assert response.status_code == 201
    monkeypatch.setenv("PORT", "8123")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    def launch(program, arguments):
        with SessionLocal() as db:
            assert db.scalar(select(Customer).where(Customer.email == "startup-preservation@example.com"))
        assert program == "uvicorn"
        assert arguments[arguments.index("--port") + 1] == "8123"
        assert arguments[arguments.index("--workers") + 1] == "1"
        raise RuntimeError("launch intercepted")
    monkeypatch.setattr(start.os, "execvp", launch)
    with pytest.raises(RuntimeError, match="launch intercepted"):
        start.main()


def test_production_refuses_ephemeral_customer_storage(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(start, "get_settings", lambda: SimpleNamespace(
        environment="production", sqlalchemy_url="sqlite:///temporary.db"))
    with pytest.raises(RuntimeError, match="persistent PostgreSQL"):
        start.main()
