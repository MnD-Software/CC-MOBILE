"""HQ delivery rate, boundary and payment contracts. Google and Pesapal are mocked."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from sqlalchemy import select
from sqlalchemy.orm import Session
from app import app_delivery
from app.commerce_models import AppDeliveryQuote, AppPolicy
from app.config import get_settings
from app.main import app
from app.routes_club import member
from test_pesapal import system, start, ipn, verify, quote, place


def configure(s, monkeypatch):
    monkeypatch.setattr(get_settings(), "google_maps_api_key", "fake-server-maps-key")
    monkeypatch.setattr(get_settings(), "google_maps_browser_key", "fake-browser-key")
    config = {"enabled": True, "origin_name": "HQ", "origin_address": "Wambugu Road", "origin": {"latitude": -1.26, "longitude": 36.81}, "radius_km": 20,
              "pickup_stores": [{"id": "store", "name": "Pickup store", "address": "Test store", "latitude": -1.27, "longitude": 36.82}]}
    with Session(s["engine"]) as db:
        db.add(AppPolicy(id="delivery", payload=config)); db.commit()
    async def google(method, url, **kwargs):
        assert "cakecity.co.ke" not in url
        s.setdefault("maps_calls", []).append((method, url, kwargs))
        if "computeRoutes" in url:
            assert kwargs["json"]["origin"]["location"]["latLng"] == config["origin"]
            return {"routes": [{"distanceMeters": s.get("meters", 5500)}]}
        return {"status": "OK", "results": [{"formatted_address": "Test building, Nairobi", "geometry": {"location": {"lat": -1.27, "lng": 36.82}}}]}
    monkeypatch.setattr(app_delivery, "google_request", google)


def route(s, fulfilment="delivery", **extra):
    payload = {"fulfilment": fulfilment, "destination": {"latitude": -1.27, "longitude": 36.82}} if fulfilment == "delivery" else {"fulfilment": "pickup", "pickup_location_id": "hq"}
    return s["client"].post("/v1/app-delivery/quote", json={**payload, **extra})


def test_delivery_charge_is_verified_through_payment_and_receipt(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    r = route(s); assert r.status_code == 200, r.text
    assert r.json()["fee_minor"] == 16500  # Owner-approved KES 30/km, minimum KES 100
    s["payload"].update(fulfilment="delivery", delivery_quote_id=r.json()["id"])
    assert quote(s)["total_minor"] == 266500
    s["amount"] = 2665
    start(s); assert ipn(s).status_code == 200
    assert verify(s).json()["payment_state"] == "completed"
    receipt = s["client"].get(f"/v1/app-orders/{s['reference']}/receipt").json()
    assert receipt["snapshot"]["route"]["distance_meters"] == 5500
    assert receipt["snapshot"]["delivery_minor"] == 16500


def test_hq_pickup_is_free_without_google(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    monkeypatch.setattr(get_settings(), "google_maps_api_key", "")
    r = route(s, "pickup"); assert r.status_code == 200, r.text
    assert r.json()["fee_minor"] == r.json()["distance_meters"] == 0
    assert not s.get("maps_calls")
    s["payload"]["delivery_quote_id"] = r.json()["id"]
    assert place(s).status_code == 200


def test_transfer_uses_half_delivery_fee(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    r = route(s, "pickup", pickup_location_id="store"); assert r.status_code == 200, r.text
    assert r.json()["fee_minor"] == 13250
    s["payload"]["delivery_quote_id"] = r.json()["id"]
    assert quote(s)["delivery_minor"] == 13250
    assert app_delivery.delivery_fee(1, transfer=True) == 5002


def test_geofence_and_forged_fees_rejected_before_provider_call(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    assert route(s, destination={"latitude": -4, "longitude": 39}).status_code == 409
    assert route(s, fee_minor=1).status_code == 422
    assert not s.get("maps_calls")


def test_quote_is_customer_bound_and_expires(system, monkeypatch):
    s = system; configure(s, monkeypatch); r = route(s).json()
    s["payload"].update(fulfilment="delivery", delivery_quote_id=r["id"])
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="other", role="customer")
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 409
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="customer")
    with Session(s["engine"]) as db:
        db.get(AppDeliveryQuote, r["id"]).expires_at = datetime.now(UTC)-timedelta(seconds=1); db.commit()
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 409


def test_policy_change_and_flat_zone_cannot_bypass_route_quote(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    s["payload"].update(fulfilment="delivery", delivery_zone_id="zone")
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 409
    s["payload"]["delivery_quote_id"] = route(s).json()["id"]
    with Session(s["engine"]) as db:
        p = db.get(AppPolicy, "delivery"); p.payload = {**p.payload, "radius_km": 10}; db.commit()
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 409


def test_missing_route_does_not_become_free_delivery(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    async def no_route(*args, **kwargs): return {"routes": []}
    monkeypatch.setattr(app_delivery, "google_request", no_route)
    assert route(s).status_code == 409
    with Session(s["engine"]) as db: assert not list(db.scalars(select(AppDeliveryQuote)))


def test_dashboard_permissions_and_no_charge_payment_preflight(system):
    s = system
    assert s["client"].get("/v1/admin/app-delivery").status_code == 403
    assert s["client"].post("/v1/admin/app-delivery/payment-check").status_code == 403
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="staff")
    assert s["client"].put("/v1/admin/app-delivery", json={"enabled": True}).status_code == 422
    result = s["client"].post("/v1/admin/app-delivery/payment-check")
    assert result.status_code == 200, result.text
    assert result.json()["charged"] is False and result.json()["notification_registered"] is True
    assert not any("SubmitOrderRequest" in c[1] for c in s["calls"])


def test_search_map_and_configuration_keep_server_key_private(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    result = s["client"].post("/v1/app-delivery/search", json={"address": "Test Nairobi"})
    assert result.status_code == 200 and result.json()["results"][0]["latitude"] == -1.27
    assert s["client"].post("/v1/app-delivery/resolve", json={"latitude": -1.27, "longitude": 36.82}).status_code == 200
    page = s["client"].get("/v1/app-delivery/map")
    assert page.status_code == 200 and "fake-browser-key" in page.text
    assert "fake-server-maps-key" not in page.text


def test_actual_branches_are_available_without_a_website_request(system):
    data = system["client"].get("/v1/app-checkout/options").json()["distance_delivery"]
    assert len(data["pickup_stores"]) == 12
    assert not any('athi-river' in b['id'] for b in data['pickup_stores'])
    assert any("Gallant" in s["name"] for s in data["pickup_stores"])
    assert any("Ruaka" in s["name"] for s in data["pickup_stores"])
    assert not data["enabled"]  # A directory is not an invented active delivery policy.


def test_address_only_branch_resolves_and_order_keeps_branch_pickup_instructions(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    with Session(s["engine"]) as db:
        p = db.get(AppPolicy, "delivery")
        p.payload = {**p.payload, "pickup_stores": [{"id": "branch", "name": "Test branch", "address": "Test branch address"}]}
        db.commit()
    r = route(s, "pickup", pickup_location_id="branch")
    assert r.status_code == 200, r.text
    assert r.json()["fee_minor"] == 13250
    assert len(s["maps_calls"]) == 2
    s["payload"]["delivery_quote_id"] = r.json()["id"]
    result = place(s)
    assert result.status_code == 200, result.text
    assert "Collect from Test branch" in result.json()["snapshot"]["pickup_instructions"]


def test_verified_delivery_pin_does_not_require_retyping_area_or_postcode(system, monkeypatch):
    s = system; configure(s, monkeypatch)
    r = route(s).json()
    s["payload"].update(fulfilment="delivery", delivery_quote_id=r["id"])
    s["payload"]["billing"].update(area="", city="", postcode="")
    assert quote(s)["delivery_minor"] == 16500
    s["payload"]["billing"]["address"] = ""
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 422
    s["payload"]["billing"]["address"] = "Building"
    s["payload"]["delivery_zone_id"] = "zone"
    with Session(s["engine"]) as db:
        policy = db.get(AppPolicy, "delivery")
        policy.payload = {**policy.payload, "enabled": False}
        db.commit()
    assert s["client"].post("/v1/app-checkout/quote", json=s["payload"]).status_code == 422
