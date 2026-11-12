from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def register(client):
    email = f"{uuid4().hex}@privacy.example.com"
    response = client.post("/v1/auth/mobile/register", json={"email": email, "password": "Privacy-test-password!", "first_name": "Private", "last_name": "Member"})
    assert response.status_code == 201, response.text
    session = response.json()
    return session, {"Authorization": "Bearer " + session["access_token"]}


def test_export_authentication_ownership_and_no_credentials(client):
    first, headers = register(client)
    second, other = register(client)
    assert client.get("/v1/account/export").status_code == 401
    response = client.get("/v1/account/export", headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["profile"]["id"] == first["customer"]["id"]
    assert second["customer"]["email"] not in response.text
    assert "password_hash" not in response.text and first["refresh_token"] not in response.text
    assert client.get("/v1/account/export", headers=other).json()["profile"]["id"] == second["customer"]["id"]


def test_close_requires_password_revokes_access_and_refresh_without_affecting_other_accounts(client):
    first, headers = register(client)
    second, other = register(client)
    assert client.post("/v1/account/close", headers=headers, json={"password": "wrong", "confirmation": "DELETE"}).status_code == 403
    assert client.post("/v1/account/close", headers=headers, json={"password": "Privacy-test-password!", "confirmation": "delete"}).status_code == 422
    assert client.post("/v1/account/close", headers=headers, json={"password": "Privacy-test-password!", "confirmation": "DELETE"}).json()["status"] == "closed"
    assert client.get("/v1/account/profile", headers=headers).status_code == 401
    assert client.get("/v1/account/export", headers=headers).status_code == 401
    assert client.post("/v1/auth/mobile/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.post("/v1/auth/mobile/login", json={"email": first["customer"]["email"], "password": "Privacy-test-password!"}).status_code == 401
    assert client.get("/v1/account/profile", headers=other).json()["id"] == second["customer"]["id"]


def test_close_removes_saved_addresses_and_club_dates(client):
    session, headers = register(client)
    address = {"label": "Home", "recipient_name": "Private Member", "phone": "0712345678", "line1": "Example Road 12", "area": "Westlands", "city": "Nairobi"}
    assert client.post("/v1/account/addresses", headers=headers, json=address).status_code == 201
    assert len(client.get("/v1/account/export", headers=headers).json()["addresses"]) == 1
    assert client.post("/v1/account/close", headers=headers, json={"password": "Privacy-test-password!", "confirmation": "DELETE"}).status_code == 200
    from app.db import SessionLocal
    from app.models import Address, Customer
    from sqlalchemy import select
    with SessionLocal() as db:
        assert not list(db.scalars(select(Address).where(Address.customer_id == session["customer"]["id"])))
        owner = db.get(Customer, session["customer"]["id"])
        assert owner.email.endswith("@deleted.invalid") and owner.phone is None
