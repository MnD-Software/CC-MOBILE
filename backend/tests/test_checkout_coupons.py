from datetime import UTC, datetime, timedelta
from sqlalchemy.orm import Session
from app.commerce_models import AppCoupon
from test_pesapal import system, quote
from test_logistics import actor


def test_coupon_discovery_is_private_owned_and_does_not_reserve_rewards(system):
    with Session(system["engine"]) as db:
        db.add_all([
            AppCoupon(code="own-reward", customer_id="buyer", amount_minor=10000, minimum_minor=100000),
            AppCoupon(code="own-next", customer_id="buyer", amount_minor=20000, minimum_minor=500000),
            AppCoupon(code="public-saved", amount_minor=5000),
            AppCoupon(code="public-hidden", amount_minor=5000),
            AppCoupon(code="other-secret", customer_id="other", amount_minor=90000),
            AppCoupon(code="expired", customer_id="buyer", amount_minor=100, expires_at=datetime.now(UTC)-timedelta(seconds=1)),
            AppCoupon(code="reserved", customer_id="buyer", amount_minor=100, reserved=1),
        ])
        db.commit()
    result = system["client"].post("/v1/account/coupons/available", json={"subtotal_minor":250000,"saved_codes":[" PUBLIC-SAVED ","other-secret"]})
    assert result.status_code == 200, result.text
    offers = {c["code"]: c for c in result.json()["coupons"]}
    assert set(offers) == {"own-reward", "own-next", "public-saved", "welcome-buyer"}
    assert offers["own-reward"]["eligible"] is True
    assert offers["own-next"]["eligible"] is False
    assert offers["own-next"]["remaining_to_minimum_minor"] == 250000
    with Session(system["engine"]) as db:
        assert db.get(AppCoupon,"own-reward").reserved == 0
        assert db.get(AppCoupon,"own-reward").uses == 0
    assert quote(system)["discount_minor"] == 0
    system["payload"]["coupon_code"] = "own-reward"
    assert quote(system)["discount_minor"] == 10000
    assert system["calls"] == []
    actor("other", "customer")
    response = system["client"].post("/v1/account/coupons/available", json={"subtotal_minor":250000,"saved_codes":["own-reward"]})
    assert "own-reward" not in response.text


def test_coupon_discovery_rejects_invalid_request_bounds(system):
    for payload in [{"subtotal_minor":-1}, {"subtotal_minor":0,"saved_codes":["a"]*21}]:
        assert system["client"].post("/v1/account/coupons/available",json=payload).status_code == 422
