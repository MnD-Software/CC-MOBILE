from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db import SessionLocal
from app.models import AdministrativeEvent


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def register(client, name="Original"):
    response = client.post("/v1/auth/mobile/register", json={"email": f"{uuid4().hex}@example.com", "password": "profile-test-password", "first_name": name, "last_name": "Owner"})
    assert response.status_code == 201
    value = response.json()
    return value, {"Authorization": "Bearer " + value["access_token"]}


def details(**changes):
    return {"first_name": "  Amina  ", "last_name": " O’Neil ", "phone": "+254 712 345 678", **changes}


def test_profile_requires_auth_and_returns_only_own_public_account_fields(client):
    assert client.get("/v1/account/profile").status_code == 401
    assert client.put("/v1/account/profile", json=details()).status_code == 401
    first, headers = register(client)
    other, other_headers = register(client, "Other")
    response = client.get("/v1/account/profile", headers=headers)
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == first["customer"]
    assert set(response.json()) == {"id", "email", "role", "first_name", "last_name", "phone"}
    assert client.get("/v1/account/profile", headers=other_headers).json()["id"] == other["customer"]["id"]


def test_profile_save_is_durable_scoped_and_keeps_identity_and_credentials(client):
    session, headers = register(client)
    other, other_headers = register(client)
    saved = client.put("/v1/account/profile", headers=headers, json=details())
    assert saved.status_code == 200, saved.text
    assert saved.headers["cache-control"] == "private, no-store"
    value = saved.json()
    assert (value["first_name"], value["last_name"], value["phone"]) == ("Amina", "O’Neil", "+254712345678")
    assert value["id"] == session["customer"]["id"] and value["role"] == "customer" and value["email"] == session["customer"]["email"]
    assert client.get("/v1/account/profile", headers=other_headers).json() == other["customer"]
    refreshed = client.post("/v1/auth/mobile/refresh", json={"refresh_token": session["refresh_token"]})
    assert refreshed.status_code == 200 and refreshed.json()["customer"] == value
    login = client.post("/v1/auth/mobile/login", json={"email": value["email"], "password": "profile-test-password"})
    assert login.status_code == 200 and login.json()["customer"] == value
    with SessionLocal() as db:
        event = db.scalar(select(AdministrativeEvent).where(AdministrativeEvent.actor_id == value["id"], AdministrativeEvent.action == "customer_profile_updated"))
        assert event.details == {"fields": ["first_name", "last_name", "phone"]}


def test_profile_rejects_identity_changes_and_invalid_values_without_partial_save(client):
    original, headers = register(client)
    for change in ({"role": "admin"}, {"id": "other"}, {"email": "other@example.com"}, {"password": "new-password"}, {"first_name": "  "}, {"last_name": "x" * 81}, {"first_name": "Hidden\u202ename"}, {"phone": "not-a-number"}, {"phone": "07123456789"}):
        assert client.put("/v1/account/profile", headers=headers, json=details(**change)).status_code == 422
    assert client.get("/v1/account/profile", headers=headers).json() == original["customer"]


def test_optional_phone_can_be_removed_and_invalid_sessions_are_rejected(client):
    session, headers = register(client)
    for phone in ("0712345678", "", None):
        response = client.put("/v1/account/profile", headers=headers, json=details(phone=phone))
        assert response.status_code == 200
        assert response.json()["phone"] == (phone or None)
    assert client.post("/v1/auth/mobile/logout", json={"refresh_token": session["refresh_token"]}).status_code == 204
    assert client.post("/v1/auth/mobile/refresh", json={"refresh_token": session["refresh_token"]}).status_code == 401
    assert client.get("/v1/account/profile", headers={"Authorization": "Bearer invalid"}).status_code == 401
