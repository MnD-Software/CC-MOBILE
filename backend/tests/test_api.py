import os

os.environ["DATABASE_URL"] = "sqlite:///./test-cakecity.db"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

from app.main import app


with TestClient(app) as client:
    def test_health_and_config():
        assert client.get("/health").json()["status"] == "ok"
        response = client.get("/v1/mobile/config")
        assert response.status_code == 200
        assert response.json()["checkout_contract"] == "cakecity-mobile-v1"

    def test_register_login_refresh_logout():
        payload = {
            "email": "buyer@example.com",
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
                "email": "buyer@example.com",
                "password": "correct-horse-battery-staple",
                "first_name": "Duplicate",
                "last_name": "Buyer",
            },
        )
        assert response.status_code == 409
