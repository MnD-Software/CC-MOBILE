from datetime import UTC, datetime, timedelta
from uuid import uuid4
from sqlalchemy.orm import Session
from app.models import RefreshToken
from app.security import token_hash
from test_logistics import delivery, actor, assign, trip, ready, progress
from test_live_tracking import moving, fix
from test_pesapal import system


def grant(s, task):
    actor("rider", "rider")
    raw = uuid4().hex + uuid4().hex
    with Session(s["engine"]) as db:
        db.add(RefreshToken(token_hash=token_hash(raw), customer_id="rider", expires_at=datetime.now(UTC)+timedelta(days=1)))
        db.commit()
    response = s["client"].post(f"/v1/rider/tasks/{task['id']}/tracking-session", json={"refresh_token": raw})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return raw, {"Authorization": "Bearer " + response.json()["token"]}


def test_background_grant_is_trip_only_revocable_and_survives_refresh(delivery):
    s=delivery; task=moving(s); raw, headers=grant(s, task)
    assert s["client"].put("/v1/rider/tracking/location", headers=headers, json=fix()).status_code == 200
    # Ordinary bearer-token endpoints cannot accept the limited location credential.
    from app.main import app
    from app.routes_club import member
    app.dependency_overrides.pop(member)
    assert s["client"].get("/v1/account/profile", headers=headers).status_code == 401
    rotated = s["client"].post("/v1/auth/mobile/refresh", json={"refresh_token": raw})
    assert rotated.status_code == 200, rotated.text
    assert s["client"].put("/v1/rider/tracking/location", headers=headers, json=fix()).status_code == 200
    assert s["client"].delete("/v1/rider/tracking/location", headers=headers).status_code == 204
    assert s["client"].put("/v1/rider/tracking/location", headers=headers, json=fix()).status_code == 401


def test_background_grant_stops_on_logout_and_after_delivery(delivery):
    s=delivery; task=moving(s); raw, headers=grant(s,task)
    task=progress(s,task,"delivered",proof="Recipient received the delivery")
    assert s["client"].put("/v1/rider/tracking/location", headers=headers, json=fix()).status_code == 409
    assert s["client"].post("/v1/auth/mobile/logout", json={"refresh_token":raw}).status_code == 204
    assert s["client"].put("/v1/rider/tracking/location", headers=headers, json=fix()).status_code == 401


def test_background_grant_requires_collection_and_owned_session(delivery):
    s=delivery; assign(s); task=trip(s); actor("other-rider","rider")
    assert s["client"].post(f"/v1/rider/tasks/{task['id']}/tracking-session", json={"refresh_token":"x"*64}).status_code == 404
    actor("rider","rider")
    assert s["client"].post(f"/v1/rider/tasks/{task['id']}/tracking-session", json={"refresh_token":"x"*64}).status_code == 409
