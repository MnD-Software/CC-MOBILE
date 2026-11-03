from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.payment_sandbox import SandboxSettings, create_sandbox_app

BILLING = {"name": "Test Buyer", "email": "buyer@example.com", "address": "Test collection, Nairobi"}


@pytest.fixture
def config():
    with TemporaryDirectory(prefix="cakecity-mobile-payment-review-") as directory:
        yield SandboxSettings(ENVIRONMENT="test", enabled=True, isolated=True,
            database_url="sqlite:///" + (Path(directory) / "payment-sandbox.db").as_posix(),
            access_token="a" * 48, webhook_secret="b" * 48, mobile_review_enabled=True,
            mobile_pairing_code="12345678", mobile_origins="http://localhost:8083")


@pytest.fixture
def client(config):
    with TestClient(create_sandbox_app(config)) as value:
        yield value


def pair(client):
    result = client.post("/v1/test-checkout/session", json={"code": "12345678"})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["token"]}


def purchase(client, headers, key=None, **extra):
    return client.post("/v1/test-checkout/purchases", headers=headers,
        json={"request_key": key or str(uuid4()), "billing": BILLING, **extra})


def complete(client, headers, payment, outcome="succeeded"):
    return client.post(f"/v1/test-checkout/purchases/{payment['id']}/complete", headers=headers, json={"outcome": outcome})


def state(client, headers):
    result = client.get("/v1/test-checkout/state", headers=headers)
    assert result.status_code == 200
    return result.json()


def test_six_purchases_reach_platinum_with_immutable_receipts(client):
    headers = pair(client)
    assert state(client, headers)["membership"]["points"] == 0
    receipts = []
    for count, tier, upcoming, remaining in [(1, "Bronze", "Silver", 1), (2, "Silver", "Gold", 2),
            (3, "Silver", "Gold", 1), (4, "Gold", "Diamond", 1), (5, "Diamond", "Platinum", 1),
            (6, "Platinum", None, 0)]:
        payment = purchase(client, headers).json()
        assert payment["amount_minor"] == 10000
        assert complete(client, headers, payment).status_code == 200
        assert complete(client, headers, payment).status_code == 200
        member = state(client, headers)["membership"]
        assert (member["points"], member["purchases"], member["tier"]) == (25 * count, count, tier)
        assert member["next_tier"] == ({"name": upcoming, "purchases_remaining": remaining} if upcoming else None)
        receipt = client.get(f"/v1/test-checkout/purchases/{payment['id']}/receipt", headers=headers).json()
        assert receipt["billing"] == BILLING
        assert receipt["points_earned"] == 25
        assert receipt["membership_at_purchase"] == member
        assert not receipt["funds_settled"] and not receipt["fiscalized"] and receipt["real_revenue_minor"] == 0
        receipts.append(receipt)
    first_again = client.get(f"/v1/test-checkout/purchases/{receipts[0]['id']}/receipt", headers=headers).json()
    assert first_again == receipts[0]  # Later purchases never change the original receipt.
    assert state(client, headers)["membership"]["next_tier"] is None
    assert state(client, headers)["membership"]["milestones"][-2:] == [
        {"purchases": 5, "name": "Diamond"}, {"purchases": 6, "name": "Platinum"}]
    # Buying beyond the final milestone retains the highest tier and earns points.
    extra = purchase(client, headers).json()
    complete(client, headers, extra)
    member = state(client, headers)["membership"]
    assert (member["points"], member["tier"], member["next_tier"]) == (175, "Platinum", None)


def test_refund_drops_preview_tier_without_rewriting_platinum_receipt(client, config):
    headers = pair(client)
    for _ in range(6):
        payment = purchase(client, headers).json()
        complete(client, headers, payment)
    assert state(client, headers)["membership"]["tier"] == "Platinum"
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.payment_sandbox import RefundPayment, SimulatedPaymentProvider, TestPayment as Payment
    engine = create_engine(config.database_url)
    try:
        with Session(engine) as db:
            row = db.get(Payment, payment["id"])
            refund = RefundPayment(request_key=str(uuid4()), amount_minor=10000)
            provider = SimulatedPaymentProvider(db)
            provider.refund_payment(row.id, refund, row.actor)
            provider.refund_payment(row.id, refund, row.actor)
    finally:
        engine.dispose()
    member = state(client, headers)["membership"]
    assert (member["points"], member["purchases"], member["tier"]) == (125, 5, "Diamond")
    assert member["next_tier"] == {"name": "Platinum", "purchases_remaining": 1}
    receipt = client.get(f"/v1/test-checkout/purchases/{payment['id']}/receipt", headers=headers).json()
    assert receipt["membership_at_purchase"]["tier"] == "Platinum"
    assert receipt["membership_at_purchase"]["points"] == 150


@pytest.mark.parametrize("outcome", ["failed", "timed_out", "cancelled"])
def test_unsuccessful_payments_have_no_points_upgrade_or_receipt(client, outcome):
    headers = pair(client)
    payment = purchase(client, headers).json()
    assert complete(client, headers, payment, outcome).status_code == 200
    assert complete(client, headers, payment, outcome).status_code == 200
    member = state(client, headers)["membership"]
    assert (member["points"], member["purchases"], member["tier"]) == (0, 0, "Bronze")
    assert client.get(f"/v1/test-checkout/purchases/{payment['id']}/receipt", headers=headers).status_code == 409
    assert complete(client, headers, payment).status_code == 409


def test_pairing_authorization_ownership_price_and_rate_limits(client):
    assert client.get("/v1/test-checkout/state").status_code == 401
    assert client.post("/v1/test-checkout/session", json={"code": "87654321"}).status_code == 401
    first, other = pair(client), pair(client)
    assert purchase(client, first, amount_minor=1).status_code == 422
    payment = purchase(client, first).json()
    assert complete(client, other, payment).status_code == 404
    assert client.get(f"/v1/test-checkout/purchases/{payment['id']}/receipt", headers=other).status_code == 404
    assert state(client, other)["history"] == []
    # A test token never grants access to the operator's generic simulator API.
    assert client.get("/v1/test-payments/catalogue", headers=first).status_code == 401
    for _ in range(8):
        response = client.post("/v1/test-checkout/session", json={"code": "87654321"})
    assert response.status_code == 429


def test_retry_and_concurrent_success_count_once(client):
    headers = pair(client)
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=4) as pool:
        payments = list(pool.map(lambda _: purchase(client, headers, key), range(4)))
    assert all(result.status_code == 201 for result in payments)
    assert len({result.json()["id"] for result in payments}) == 1
    payment = payments[0].json()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: complete(client, headers, payment), range(4)))
    assert all(result.status_code == 200 for result in results)
    assert state(client, headers)["membership"]["points"] == 25
    assert len(state(client, headers)["history"]) == 1


def test_review_recovers_after_restart_and_fresh_run_is_separate(config):
    with TestClient(create_sandbox_app(config)) as client:
        headers = pair(client)
        payment = purchase(client, headers).json()
        complete(client, headers, payment)
    with TestClient(create_sandbox_app(config)) as client:
        assert state(client, headers)["membership"]["points"] == 25
        fresh = client.post("/v1/test-checkout/new-run", headers=headers, json={}).json()
        other = {"Authorization": "Bearer " + fresh["token"]}
        assert state(client, other)["membership"]["points"] == 0
        assert state(client, headers)["membership"]["points"] == 25


def test_refunds_reverse_test_points_without_rewriting_sale_receipt(client, config):
    headers = pair(client)
    payment = purchase(client, headers).json()
    complete(client, headers, payment)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.payment_sandbox import RefundPayment, SimulatedPaymentProvider, TestPayment as Payment
    second = purchase(client, headers).json()
    complete(client, headers, second)
    assert state(client, headers)["membership"]["tier"] == "Silver"
    engine = create_engine(config.database_url)
    try:
        with Session(engine) as db:
            row = db.get(Payment, payment["id"])
            SimulatedPaymentProvider(db).refund_payment(row.id, RefundPayment(request_key=str(uuid4()), amount_minor=10000), row.actor)
    finally:
        engine.dispose()
    member = state(client, headers)["membership"]
    assert (member["points"], member["purchases"], member["tier"]) == (25, 1, "Bronze")
    receipt = client.get(f"/v1/test-checkout/purchases/{payment['id']}/receipt", headers=headers).json()
    assert receipt["membership_at_purchase"]["points"] == 25
    assert receipt["points_earned"] == 25
    assert receipt["current_refunded_minor"] == 10000


def test_mobile_review_cannot_be_enabled_in_hosted_production_or_staging(config):
    for environment in ["production", "staging", "review"]:
        changed = config.model_copy(update={"environment": environment})
        with pytest.raises(RuntimeError):
            create_sandbox_app(changed)
