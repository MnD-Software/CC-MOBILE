from datetime import UTC, datetime, timedelta
from sqlalchemy.orm import Session
from app.logistics_models import RiderPosition
from test_logistics import delivery, actor, assign, ready, trip, progress
from test_pesapal import system


def fix(**extra):
    return {"latitude": -1.267, "longitude": 36.81, "accuracy": 12, "recorded_at": datetime.now(UTC).isoformat(), **extra}


def moving(s):
    assign(s)
    task=trip(s)
    task=progress(s,task,"accepted")
    ready(s)
    task=progress(s,task,"collected")
    return progress(s,task,"in_transit")


def test_customer_sees_real_rider_updates_and_scoped_dispatch_history(delivery):
    s=delivery; task=moving(s)
    path=f"/v1/rider/tasks/{task['id']}/location"
    first=fix()
    assert s["client"].put(path,json=first).status_code==200
    actor("buyer","customer")
    response=s["client"].get("/v1/app-orders/"+s["reference"])
    assert response.headers["cache-control"]=="private, no-store"
    value=response.json()["deliveries"][0]
    assert value["position"]["latitude"]==first["latitude"]
    assert value["position"]["stale"] is False
    assert [event["status"] for event in value["events"]]==["assigned","accepted","collected","in_transit"]
    assert all(set(event)=={"status","at"} for event in value["events"])
    actor("other-rider","rider")
    assert s["client"].put(path,json=fix()).status_code==404
    assert s["client"].delete(path).status_code==404
    assert s["client"].get("/v1/app-orders/"+s["reference"]).status_code==404
    actor("buyer","customer")
    assert s["client"].put(path,json=fix()).status_code==403
    actor("rider","rider")
    assert s["client"].put(path,json=fix(latitude=-1.268)).status_code==200
    actor("buyer","customer")
    assert s["client"].get("/v1/app-orders/"+s["reference"]).json()["deliveries"][0]["position"]["latitude"]==-1.268


def test_no_tracking_before_collection_and_after_completion(delivery):
    s=delivery; assign(s); task=trip(s)
    path=f"/v1/rider/tasks/{task['id']}/location"
    actor("rider","rider")
    assert s["client"].put(path,json=fix()).status_code==409
    task=progress(s,task,"accepted");ready(s)
    task=progress(s,task,"collected");task=progress(s,task,"in_transit")
    assert s["client"].put(path,json=fix()).status_code==200
    task=progress(s,task,"delivered",proof="Received by recipient")
    assert s["client"].put(path,json=fix()).status_code==409
    with Session(s["engine"]) as db:
        assert db.get(RiderPosition,task["id"]) is None
    actor("buyer","customer")
    assert s["client"].get("/v1/app-orders/"+s["reference"]).json()["deliveries"][0]["position"] is None


def test_stale_and_out_of_order_fixes_are_not_presented_as_live(delivery):
    s=delivery; task=moving(s);path=f"/v1/rider/tasks/{task['id']}/location"
    old=fix(recorded_at=(datetime.now(UTC)-timedelta(seconds=100)).isoformat())
    assert s["client"].put(path,json=old).status_code==200
    actor("buyer","customer")
    assert s["client"].get("/v1/app-orders/"+s["reference"]).json()["deliveries"][0]["position"]["stale"] is True
    actor("rider","rider")
    assert s["client"].put(path,json=fix()).status_code==200
    assert s["client"].put(path,json=old).json()["status"]=="ignored_older_fix"
    assert s["client"].put(path,json=fix(recorded_at=(datetime.now(UTC)-timedelta(minutes=5)).isoformat())).status_code==422
    assert s["client"].put(path,json=fix(latitude=91)).status_code==422
    assert s["client"].put(path,json=fix(accuracy=900)).status_code==422
    assert s["client"].delete(path).status_code==204
    actor("buyer","customer")
    assert s["client"].get("/v1/app-orders/"+s["reference"]).json()["deliveries"][0]["position"] is None


def test_public_map_is_only_a_static_shell_with_no_private_coordinates(delivery):
    response=delivery["client"].get("/v1/delivery-tracking/map")
    assert response.status_code==200
    assert "renderTracking" in response.text
    assert "OpenStreetMap" in response.text
    assert delivery["reference"] not in response.text
