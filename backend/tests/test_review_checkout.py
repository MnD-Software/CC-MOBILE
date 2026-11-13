"""No-charge full-price orders are available only through the local review factory."""
from uuid import uuid4
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app import review_checkout
from app.commerce_models import AppOrder, AppProduct, SalesRecord
from app.club_celebrations import ClubAchievement
from test_pesapal import system, quote
from test_logistics import actor


@pytest.fixture
def review_routes(system, monkeypatch):
    original = list(app.router.routes)
    app.include_router(review_checkout.router)
    # The existing system fixture is an isolated in-memory DB with mocked providers.
    monkeypatch.setattr(review_checkout, "require_local_review", lambda: None)
    yield system
    app.router.routes[:] = original


def place_review(s, key=None):
    q = quote(s)
    result = s["client"].post("/v1/review-checkout/orders", json={"quote_id": q["id"]}, headers={"Idempotency-Key": key or uuid4().hex})
    assert result.status_code == 200, result.text
    return result.json(), q


def test_normal_app_does_not_mount_review_checkout_and_guard_rejects_test_settings(system):
    assert system["client"].get("/v1/review-checkout/config").status_code == 404
    with pytest.raises(Exception) as error:
        review_checkout.require_local_review()
    assert error.value.status_code == 403
    with pytest.raises(Exception) as setup_error:
        review_checkout.prepare_checkout(None)
    assert setup_error.value.status_code == 403


def test_all_product_prices_remain_and_three_purchases_unlock_each_tier(review_routes):
    s = review_routes
    for number in range(1, 10):
        key = uuid4().hex
        order, q = place_review(s, key)
        assert order["review_checkout"] is True and order["due_now_minor"] == 0
        assert order["total_minor"] == q["total_minor"] == 250000
        assert order["payment_state"] == "completed" and order["status"] == "paid"
        assert order["reference"].startswith("APP-") and "TEST" not in order["reference"]
        retry = s["client"].post("/v1/review-checkout/orders", json={"quote_id": q["id"]}, headers={"Idempotency-Key": key})
        assert retry.json()["reference"] == order["reference"]
        if number in (3, 6, 9):
            club = s["client"].get("/v1/club").json()
            assert club["tier"] == {3: "Gold", 6: "Diamond", 9: "Platinum"}[number]
            assert club["journey"]["purchase_count"] == number
    assert s["calls"] == []
    with Session(s["engine"]) as db:
        assert list(db.scalars(select(SalesRecord))) == []
        assert db.get(AppProduct, 12).sold == 9
        assert len(list(db.scalars(select(ClubAchievement)))) == 4
        assert all(o.channel == "app_test" for o in db.scalars(select(AppOrder)))


def test_review_order_ownership_and_changed_price_are_enforced(review_routes):
    s = review_routes
    q = quote(s)
    actor("other", "customer")
    assert s["client"].post("/v1/review-checkout/orders", json={"quote_id": q["id"]}, headers={"Idempotency-Key": uuid4().hex}).status_code == 409
    actor("buyer", "customer")
    with Session(s["engine"]) as db:
        db.get(AppProduct, 12).price_minor += 100
        db.commit()
    assert s["client"].post("/v1/review-checkout/orders", json={"quote_id": q["id"]}, headers={"Idempotency-Key": uuid4().hex}).status_code == 409


def test_missing_review_setup_supports_pickup_and_delivery_without_maps(review_routes):
    from app.commerce_models import AppPolicy, AppDeliveryZone
    s = review_routes
    with Session(s["engine"]) as db:
        db.delete(db.get(AppPolicy, "checkout"))
        db.delete(db.get(AppDeliveryZone, "zone"))
        db.commit()
        review_checkout.prepare_checkout(db)
        db.commit()
        review_checkout.prepare_checkout(db)
        db.commit()
        assert len(list(db.scalars(select(AppDeliveryZone)))) == 1
    options = s["client"].get("/v1/app-checkout/options").json()
    assert options["pickup_enabled"] and not options["distance_delivery"]["enabled"]
    assert options["delivery_zones"] == [{"id": "local-delivery", "name": "Delivery", "fee_minor": 0}]
    for fulfilment in ("pickup", "delivery"):
        s["payload"].update(fulfilment=fulfilment, delivery_zone_id="local-delivery")
        order, _ = place_review(s)
        assert order["payment_state"] == "completed" and order["due_now_minor"] == 0
    assert not s["calls"]


def test_review_setup_preserves_operator_settings(review_routes):
    from app.commerce_models import AppPolicy, AppDeliveryZone
    with Session(review_routes["engine"]) as db:
        db.get(AppPolicy, "checkout").payload = {"enabled": False, "pickup_enabled": False}
        db.get(AppDeliveryZone, "zone").enabled = False
        db.commit()
        review_checkout.prepare_checkout(db)
        db.commit()
        assert db.get(AppPolicy, "checkout").payload == {"enabled": False, "pickup_enabled": False}
        assert not db.get(AppDeliveryZone, "zone").enabled
        assert len(list(db.scalars(select(AppDeliveryZone)))) == 1
def test_accessories_are_separate_and_cakes_sort_by_available_variation_price(system):
    from app.app_catalogue import products
    with Session(system["engine"]) as db:
        db.add_all([
            AppProduct(id=20, slug="candle", payload={"id": 20, "name": "Party candles", "categories": [{"id": 109, "name": "Candles"}]}, price_minor=5000, allocation=10, enabled=True),
            AppProduct(id=21, slug="variable", payload={"id": 21, "name": "Vanilla cake", "type": "variable", "categories": []}, enabled=True),
            AppProduct(id=22, slug="small", parent_id=21, payload={"id": 22, "name": "Small Vanilla", "type": "variation"}, price_minor=100000, allocation=10, enabled=True),
        ])
        db.commit()
        rows, pages = products(db, dict(orderby="price", order="asc", exclude_accessories="true", per_page=1, page=1))
        assert rows[0]["id"] == 21 and pages == 2
        rows, pages = products(db, dict(orderby="price", accessories_only="true"))
        assert [r["id"] for r in rows] == [20] and pages == 1


def test_review_order_moves_through_kitchen_dispatch_rider_and_customer_inbox(review_routes):
    from app.models import Customer
    from app.notification_models import PushJob
    from test_logistics import assign, ready, trip, progress
    s = review_routes
    s["payload"].update(fulfilment="delivery", delivery_zone_id="zone", notes="Call at the gate; keep the cake upright.")
    order, _ = place_review(s)
    s["reference"] = order["reference"]
    with Session(s["engine"]) as db:
        for identity, role in [("chef", "production"), ("rider", "rider")]:
            db.add(Customer(id=identity, email=identity+"@review.example.com", first_name=identity, last_name="Review", role=role, password_hash="unused"))
        db.commit()
    actor()
    assign(s)
    task = trip(s)
    assert task["delivery_notes"] == s["payload"]["notes"]
    assert task["items"][0]["selection"]["message"] == "Happy birthday"
    task = progress(s, task, "accepted")
    ready(s)
    for state in ("collected", "in_transit"):
        task = progress(s, task, state)
    progress(s, task, "delivered", proof="Received by the named customer")
    actor("buyer", "customer")
    result = s["client"].get("/v1/app-orders/" + order["reference"]).json()
    assert result["status"] == "completed" and result["review_checkout"] is True
    inbox = s["client"].get("/v1/account/notifications").json()
    assert {n["kind"] for n in inbox} >= {"payment_completed", "fulfilment_preparing", "fulfilment_ready", "fulfilment_out_for_delivery", "fulfilment_completed"}
    assert all("simulation" not in n["title"].lower() and not n["title"].startswith("Test:") for n in inbox)
    with Session(s["engine"]) as db:
        assert not list(db.scalars(select(PushJob)))
        assert not list(db.scalars(select(SalesRecord)))
    assert not s["calls"]


def test_cookie_and_accessory_exclusion_precedes_pagination_and_keeps_themed_cakes(system):
    from app.app_catalogue import products
    with Session(system["engine"]) as db:
        for identity,name,categories in [(31,"Butter Cookies",[{"id":111,"name":"Cookies"}]), (32,"Number Candles",[]), (33,"Colorful Balloons Car Cake",[{"id":267,"name":"Car Cakes"}]), (34,"Cookies and Cream Cake",[{"id":229,"name":"Signature Cakes"}])]:
            db.add(AppProduct(id=identity,slug="product-"+str(identity),payload={"id":identity,"name":name,"categories":categories},price_minor=10000,allocation=10,enabled=True))
        db.commit()
        rows,pages=products(db,dict(exclude_cookies="true",exclude_accessories="true",per_page=100))
        assert {r["id"] for r in rows} == {12,33,34} and pages==1
        rows,_=products(db,dict(cookies_only="true"))
        assert [r["id"] for r in rows] == [31]
    response=system["client"].get("/v1/catalogue/products?cookies_only=true")
    assert response.status_code==200 and [r["id"] for r in response.json()] == [31]


def test_celebration_dates_can_be_updated_only_by_the_owner(system):
    s=system
    body=dict(name="Mum",month=2,day=29,occasion="birthday",notes="Keep this note")
    created=s["client"].post("/v1/account/celebrations",json=body)
    assert created.status_code==201,created.text
    path="/v1/account/celebrations/"+created.json()["id"]
    actor("other","customer")
    assert s["client"].put(path,json={**body,"day":28}).status_code==404
    actor("buyer","customer")
    assert s["client"].put(path,json={**body,"month":2,"day":30}).status_code==422
    updated=s["client"].put(path,json={**body,"day":28})
    assert updated.status_code==200 and updated.json()["notes"]=="Keep this note" and updated.json()["day"]==28
    assert len(s["client"].get("/v1/account/celebrations").json())==1


def test_all_cakes_excludes_cupcakes_before_pagination(system):
    with Session(system["engine"]) as db:
        db.add(AppProduct(id=81,slug="vanilla-cupcakes",payload={"id":81,"name":"Vanilla cupcakes","categories":[{"id":110,"name":"Cupcakes"}]},price_minor=1000,allocation=10,enabled=True))
        db.commit()
    response=system["client"].get("/v1/catalogue/products?exclude_cupcakes=true&orderby=price&per_page=1")
    assert response.status_code==200 and [r["id"] for r in response.json()]==[12]
    assert response.headers["X-Total-Pages"]=="1"
    response=system["client"].get("/v1/catalogue/products?category=110")
    assert [r["id"] for r in response.json()]==[81]
