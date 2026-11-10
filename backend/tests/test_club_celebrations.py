from types import SimpleNamespace
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_pesapal import system, start, verify
from app.main import app
from app.routes_club import OrderEvent, apply_order_event, member
from app.club_celebrations import ClubAchievement, pending


def test_first_verified_points_are_persistent_owned_and_acknowledged_once(system):
    s = system
    start(s)
    assert s["client"].get("/v1/club").json()["celebrations"] == []
    assert verify(s).status_code == 200
    result = s["client"].get("/v1/club").json()
    event = result["celebrations"][0]
    assert event["kind"] == "first_points" and event["points"] == 25
    assert result["journey"]["qualifying_spend_kes"] == 2500
    assert verify(s).status_code == 200
    assert len(s["client"].get("/v1/club").json()["celebrations"]) == 1
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="other", role="customer")
    path = f"/v1/club/celebrations/{event['id']}/ack"
    assert s["client"].post(path).status_code == 404
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="customer")
    for _ in range(2):
        assert s["client"].post(path).status_code == 200
    assert s["client"].get("/v1/club").json()["celebrations"] == []


def test_each_tier_is_awarded_once_and_refunds_do_not_replay_it(system):
    s = system
    with Session(s["engine"]) as db:
        apply_order_event(OrderEvent(event_id="huge-order", order_id="award-order", customer_id="buyer", paid_minor=10000000), db)
        kinds = {a.kind for a in db.scalars(select(ClubAchievement))}
        assert kinds == {"first_points", "tier_gold", "tier_diamond", "tier_platinum"}
        assert [row["kind"] for row in pending(db, "buyer")] == ["first_points", "tier_gold", "tier_diamond", "tier_platinum"]
        apply_order_event(OrderEvent(event_id="refund-huge", order_id="award-order", customer_id="buyer", paid_minor=10000000, refunded_minor=10000000), db)
        apply_order_event(OrderEvent(event_id="second-huge", order_id="second-order", customer_id="buyer", paid_minor=10000000), db)
        assert len(list(db.scalars(select(ClubAchievement)))) == 4


def test_failed_payment_does_not_award_points_or_celebrate(system):
    s = system
    start(s)
    s["state"] = 2
    verify(s)
    value = s["client"].get("/v1/club").json()
    assert value["points"] == 0 and value["celebrations"] == []


def test_fully_refunded_first_order_does_not_consume_the_first_points_prompt(system):
    s = system
    with Session(s["engine"]) as db:
        apply_order_event(OrderEvent(event_id="already-refunded", order_id="refunded", customer_id="buyer", paid_minor=10000, refunded_minor=10000), db)
        assert not list(db.scalars(select(ClubAchievement)))
        apply_order_event(OrderEvent(event_id="first-earned", order_id="paid", customer_id="buyer", paid_minor=10000), db)
        assert db.scalar(select(ClubAchievement)).kind == "first_points"
