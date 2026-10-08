from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value

def register(client):
    session = client.post("/v1/auth/mobile/register", json={"email": f"{uuid4().hex}@example.com", "password": "test-password-long", "first_name": "Address", "last_name": "Owner"}).json()
    return {"Authorization": f"Bearer {session['access_token']}"}

def address(label="Home", **changes):
    return {"label": label, "recipient_name": "Cake Friend", "phone": "0712345678", "line1": "Building 12, Example Road", "area": "Westlands", "city": "Nairobi", **changes}

def test_addresses_require_auth_validate_and_never_cross_accounts(client):
    alice, bob = register(client), register(client)
    assert client.get("/v1/account/addresses").status_code == 401
    assert client.post("/v1/account/addresses", headers=alice, json=address(phone="bad")).status_code == 422
    first = client.post("/v1/account/addresses", headers=alice, json=address())
    assert first.status_code == 201
    saved = first.json()
    assert saved["is_default"] is True
    assert client.get("/v1/account/addresses", headers=bob).json() == []
    path = f"/v1/account/addresses/{saved['id']}"
    assert client.put(path, headers=bob, json=address()).status_code == 404
    assert client.delete(path, headers=bob).status_code == 404
    assert client.get("/v1/account/addresses", headers=alice).json()[0]["line1"] == address()["line1"]

def test_default_address_switch_edit_and_delete_are_consistent(client):
    headers = register(client)
    first = client.post("/v1/account/addresses", headers=headers, json=address()).json()
    second = client.post("/v1/account/addresses", headers=headers, json=address("Office", is_default=True)).json()
    assert second["is_default"] is True
    values = client.get("/v1/account/addresses", headers=headers).json()
    assert sum(x["is_default"] for x in values) == 1
    assert values[0]["id"] == second["id"]
    path = f"/v1/account/addresses/{second['id']}"
    assert client.put(path, headers=headers, json=address("Work", line2="Reception")).json()["is_default"] is True
    assert client.delete(path, headers=headers).status_code == 204
    values = client.get("/v1/account/addresses", headers=headers).json()
    assert len(values) == 1 and values[0]["id"] == first["id"] and values[0]["is_default"] is True
