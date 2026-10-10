import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Customer


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def session(client, staff=False):
    response = client.post("/v1/auth/mobile/register", json={"email": f"{uuid4().hex}@example.com", "password": "test-password-long", "first_name": "Content", "last_name": "Editor"})
    assert response.status_code == 201
    result = response.json()
    if staff:
        with SessionLocal() as db:
            db.get(Customer, result["customer"]["id"]).role = "staff"
            db.commit()
    return {"Authorization": f"Bearer {result['access_token']}"}


def campaign(**overrides):
    now = datetime.now(UTC)
    return {"title": "Cake spotlight", "description": "Real cake photography", "image_url": "https://cakecity.co.ke/photo.jpg", "starts_at": (now - timedelta(hours=1)).isoformat(), "ends_at": (now + timedelta(hours=1)).isoformat(), "product_slugs": ["lotus-cake"], "published": True, **overrides}


def test_only_staff_can_edit_and_stale_edits_are_rejected(client):
    customer = session(client)
    editor = session(client, staff=True)
    assert client.get("/v1/admin/content").status_code == 401
    assert client.post("/v1/admin/content/campaigns", json=campaign(), headers=customer).status_code == 403
    result = client.post("/v1/admin/content/campaigns", json=campaign(), headers=editor)
    assert result.status_code == 201
    record = result.json()
    path = f"/v1/admin/content/campaigns/{record['id']}"
    assert client.put(path, json=campaign(revision=0), headers=editor).status_code == 409
    assert client.put(path, json=campaign(revision=1, published=False), headers=editor).status_code == 200
    assert not any(row["id"] == record["id"] for row in client.get("/v1/content").json()["campaigns"])


def test_schedule_and_links_require_realistic_contracts(client):
    editor = session(client, staff=True)
    now = datetime.now(UTC)
    for payload in (campaign(ends_at=(now - timedelta(days=2)).isoformat()), campaign(starts_at="2026-10-10T10:00:00"), campaign(product_slugs=[]), campaign(image_url="javascript:alert(1)"), campaign(product_slugs=["a", "a"])):
        assert client.post("/v1/admin/content/campaigns", json=payload, headers=editor).status_code == 422
    future = client.post("/v1/admin/content/campaigns", json=campaign(starts_at=(now + timedelta(days=1)).isoformat(), ends_at=(now + timedelta(days=2)).isoformat()), headers=editor).json()
    expired = client.post("/v1/admin/content/campaigns", json=campaign(starts_at=(now - timedelta(days=2)).isoformat(), ends_at=(now - timedelta(days=1)).isoformat()), headers=editor).json()
    draft = client.post("/v1/admin/content/campaigns", json=campaign(published=False), headers=editor).json()
    active = client.post("/v1/admin/content/campaigns", json=campaign(member_only=True), headers=editor).json()
    identities = [row["id"] for row in client.get("/v1/content").json()["campaigns"]]
    assert active["id"] in identities
    assert not set(identities) & {future["id"], expired["id"], draft["id"]}


def test_product_details_are_opt_in_and_uploads_persist(client):
    editor = session(client, staff=True)
    assert client.get("/v1/content/products/921").json() is None
    payload = {"product_id": 921, "published": True, "servings": "1 kg: 8–10 people", "preparation_hours": 24, "video_url": "https://cakecity.co.ke/cake.mp4"}
    assert client.put("/v1/admin/content/products/921", json=payload, headers=editor).status_code == 200
    assert client.get("/v1/content/products/921").json()["preparation_hours"] == 24
    assert client.put("/v1/admin/content/products/922", json=payload, headers=editor).status_code == 422
    assert client.post("/v1/admin/content/assets", json={"mime": "image/png", "data": base64.b64encode(b"<svg>alert()</svg>").decode()}, headers=editor).status_code == 422
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTz8AAAAASUVORK5CYII=")
    result = client.post("/v1/admin/content/assets", json={"mime": "image/png", "data": base64.b64encode(image).decode()}, headers=editor)
    assert result.status_code == 201
    media = client.get(result.json()["url"])
    assert media.content == image
    assert media.headers["content-type"] == "image/png"
    assert "immutable" in media.headers["cache-control"]
