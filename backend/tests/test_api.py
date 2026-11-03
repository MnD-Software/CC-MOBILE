from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app

TEST_EMAIL = f"buyer-{uuid4().hex}@example.com"

@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value

def test_health_and_config(client):
    assert client.get("/health").json()["status"] == "ok"
    response = client.get("/v1/mobile/config")
    assert response.status_code == 200
    assert response.json()["checkout_contract"] == "cakecity-mobile-v1"

def test_catalogue_category_requires_a_positive_id(client):
    response = client.get("/v1/catalogue/products?category=0")
    assert response.status_code == 422

def test_catalogue_reads_category_from_local_app_store(client, monkeypatch):
    from app import app_catalogue
    received={}
    def stored(db,params):
        received.update(params)
        return [],0
    monkeypatch.setattr(app_catalogue,"products",stored)
    response=client.get("/v1/catalogue/products?page=2&per_page=6&category=229")
    assert response.status_code==200
    assert received["category"]=="229" and received["page"]==2


def test_register_login_refresh_logout(client):
    payload = {
        "email": TEST_EMAIL,
        "password": "correct-horse-battery-staple",
        "first_name": "Cake",
        "last_name": "Buyer",
    }
    registered = client.post("/v1/auth/mobile/register", json=payload)
    assert registered.status_code == 201
    session = registered.json()
    assert session["token_type"] == "bearer"

    login = client.post("/v1/auth/mobile/login", json={"email": payload["email"], "password": payload["password"]})
    assert login.status_code == 200
    refreshed = client.post("/v1/auth/mobile/refresh", json={"refresh_token": session["refresh_token"]})
    assert refreshed.status_code == 200
    assert client.post("/v1/auth/mobile/logout", json={"refresh_token": refreshed.json()["refresh_token"]}).status_code == 204

def test_duplicate_registration_is_rejected(client):
    response = client.post(
        "/v1/auth/mobile/register",
        json={
            "email": TEST_EMAIL,
            "password": "correct-horse-battery-staple",
            "first_name": "Duplicate",
            "last_name": "Buyer",
        },
    )
    assert response.status_code == 409
