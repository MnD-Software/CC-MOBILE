import os
from uuid import uuid4

os.environ["DATABASE_URL"] = "sqlite:///./test-cakecity.db"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

from app.main import app

TEST_EMAIL = f"buyer-{uuid4().hex}@example.com"

with TestClient(app) as client:
    def test_health_and_config():
        assert client.get("/health").json()["status"] == "ok"
        response = client.get("/v1/mobile/config")
        assert response.status_code == 200
        assert response.json()["checkout_contract"] == "cakecity-mobile-v1"

    def test_catalogue_category_requires_a_positive_id():
        response = client.get("/v1/catalogue/products?category=0")
        assert response.status_code == 422

    def test_catalogue_forwards_a_valid_category(monkeypatch):
        received: dict[str, object] = {}

        class FakeResponse:
            def raise_for_status(self) -> None:
                pass

            def json(self) -> list[object]:
                return []

        class FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args: object) -> None:
                pass

            async def get(self, url: str, params: dict[str, object]):
                received["url"] = url
                received["params"] = params
                return FakeResponse()

        monkeypatch.setattr("app.routes.httpx.AsyncClient", FakeClient)
        response = client.get(
            "/v1/catalogue/products?page=2&per_page=6&category=229"
        )
        assert response.status_code == 200
        assert received["params"] == {
            "page": 2,
            "per_page": 6,
            "category": 229,
        }

    def test_register_login_refresh_logout():
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

    def test_duplicate_registration_is_rejected():
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
