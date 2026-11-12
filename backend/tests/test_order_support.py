from uuid import uuid4
from test_logistics import delivery, actor
from test_pesapal import system


def test_order_support_is_scoped_idempotent_and_does_not_refund(delivery):
    s = delivery; actor("buyer", "customer")
    path = f"/v1/app-orders/{s['reference']}/support"
    data = {"request_key": uuid4().hex, "category": "refund", "details": "Please review my cake order for a refund."}
    first = s["client"].post(path, json=data)
    assert first.status_code == 201, first.text
    assert s["reference"] in first.json()["subject"]
    assert s["client"].post(path, json=data).json()["id"] == first.json()["id"]
    assert s["client"].post(path, json={**data, "details": "This is a different request now."}).status_code == 409
    assert s["client"].get(f"/v1/app-orders/{s['reference']}").json()["payment_state"] == "completed"
    actor("other-rider", "rider")
    assert s["client"].post(path, json={**data, "request_key": uuid4().hex}).status_code == 404
    actor("buyer", "customer")
    assert len(s["client"].get("/v1/account/enquiries").json()) == 1


def test_support_reply_notifies_the_owner_with_request_link(delivery):
    s = delivery; actor("buyer", "customer")
    response = s["client"].post(f"/v1/app-orders/{s['reference']}/support", json={"request_key": uuid4().hex, "category": "delivery", "details": "Please help me with this delivery request."})
    identity = response.json()["id"]
    actor()
    reply = s["client"].patch(f"/v1/admin/enquiries/{identity}", json={"revision": 1, "status": "reviewing", "response": "Our dispatch team is checking your delivery."})
    assert reply.status_code == 200, reply.text
    actor("buyer", "customer")
    notifications = s["client"].get("/v1/account/notifications").json()
    assert any(n["kind"] == "support_reply" and n["data"]["url"] == "/requests" for n in notifications)
