import hashlib
import hmac
import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy import text

from app.main import app as commerce_app
from app.payment_sandbox import SandboxSettings, create_sandbox_app

ACCESS = "review-only-access-" + "a" * 40
SECRET = "review-webhook-" + "b" * 40
HEADERS = {"Authorization": "Bearer " + ACCESS}


@pytest.fixture
def tmp_path():
    # Avoid stale pytest-of-user directories with inherited Windows ACLs.
    with TemporaryDirectory(prefix="cakecity-payment-sandbox-") as directory:
        yield Path(directory)


def settings(tmp_path, **overrides):
    return SandboxSettings(**{
        "ENVIRONMENT": "test", "enabled": True, "isolated": True,
        "database_url": "sqlite:///" + (tmp_path / "payment-sandbox.db").as_posix(),
        "access_token": ACCESS, "webhook_secret": SECRET, **overrides,
    })


@pytest.fixture
def client(tmp_path):
    with TestClient(create_sandbox_app(settings(tmp_path))) as value:
        yield value


def initiate(client, **overrides):
    return client.post("/v1/test-payments", headers=HEADERS, json={
        "request_key": str(uuid4()), "lines": [{"sku": "TEST-CAKE", "quantity": 1}], **overrides,
    })


def callback(payment, **overrides):
    return {"event_key": str(uuid4()), "status": "succeeded", "amount_minor": payment["amount_minor"], "currency": "KES", **overrides}


@pytest.mark.parametrize("overrides", [
    {"ENVIRONMENT": "production"}, {"ENVIRONMENT": "PRODUCTION"}, {"ENVIRONMENT": "unknown"},
    {"enabled": False}, {"isolated": False}, {"access_token": "short"},
    {"webhook_secret": ACCESS}, {"database_url": "sqlite:///cakecity-dev.db"},
    {"database_url": "postgresql://user:password@localhost/commerce"},
    {"database_url": "sqlite:///:memory:"},
])
def test_guard_rejects_unsafe_environment_before_creating_database(tmp_path, overrides):
    with pytest.raises(RuntimeError):
        create_sandbox_app(settings(tmp_path, **overrides))
    assert not (tmp_path / "payment-sandbox.db").exists()


def test_sandbox_never_mounted_on_commerce_app_and_has_separate_metadata(client, tmp_path):
    # Assert the HTTP boundary rather than FastAPI's private router structure.
    with TestClient(commerce_app) as commerce:
        assert commerce.get("/v1/test-payments/catalogue").status_code == 404
        assert commerce.post("/v1/test-payments", json={}).status_code == 404
    assert not any("test-payments" in path for path in commerce_app.openapi()["paths"])
    engine = create_engine(settings(tmp_path).database_url)
    try:
        assert set(inspect(engine).get_table_names()) == {"sandbox_payments_v1", "sandbox_payment_events_v1"}
    finally:
        engine.dispose()


def test_existing_business_database_cannot_be_used_even_when_renamed(tmp_path):
    config = settings(tmp_path)
    engine = create_engine(config.database_url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE customers (id TEXT PRIMARY KEY)"))
    engine.dispose()
    with pytest.raises(RuntimeError, match="non-sandbox"):
        with TestClient(create_sandbox_app(config)):
            pytest.fail("Business database must not start")
    engine = create_engine(config.database_url)
    try:
        assert inspect(engine).get_table_names() == ["customers"]
    finally:
        engine.dispose()


def test_reviewer_authorization_and_server_owned_fixture_prices(client):
    assert client.post("/v1/test-payments", json={}).status_code == 401
    assert client.get("/v1/test-payments/catalogue").status_code == 401
    assert initiate(client, amount_minor=1).status_code == 422
    assert initiate(client, lines=[{"sku": "TEST-CAKE", "quantity": 1.5}]).status_code == 422
    assert initiate(client, lines=[{"sku": "LIVE-PRODUCT", "quantity": 1}]).status_code == 422
    result = initiate(client, lines=[{"sku": "TEST-CAKE", "quantity": 2}, {"sku": "TEST-CANDLES", "quantity": 1}])
    assert result.status_code == 201
    assert result.json()["amount_minor"] == 720_000
    assert result.json()["simulated"] is True
    assert result.headers["cache-control"] == "no-store"


def test_idempotency_survives_service_restart_and_conflicts_are_rejected(tmp_path):
    config = settings(tmp_path)
    key = str(uuid4())
    with TestClient(create_sandbox_app(config)) as client:
        first = initiate(client, request_key=key).json()
        assert initiate(client, request_key=key).json()["id"] == first["id"]
        assert initiate(client, request_key=key, lines=[{"sku": "TEST-CAKE", "quantity": 2}]).status_code == 409
    with TestClient(create_sandbox_app(config)) as client:
        assert initiate(client, request_key=key).json()["id"] == first["id"]


@pytest.mark.parametrize("outcome", ["succeeded", "failed", "timed_out", "cancelled"])
def test_outcomes_are_terminal_and_receipts_are_test_only(client, outcome):
    payment = initiate(client).json()
    path = "/v1/test-payments/" + payment["id"]
    event = callback(payment, status=outcome)
    assert client.get(path + "/receipt", headers=HEADERS).status_code == 409
    assert client.post(path + "/simulate", headers=HEADERS, json=event).json()["status"] == outcome
    assert client.post(path + "/simulate", headers=HEADERS, json=event).status_code == 200
    assert client.post(path + "/simulate", headers=HEADERS, json=callback(payment)).status_code == 409
    receipt = client.get(path + "/receipt", headers=HEADERS)
    if outcome == "succeeded":
        assert receipt.status_code == 200
        assert "TEST" in receipt.json()["label"]
        assert receipt.json()["funds_settled"] is False
        assert receipt.json()["fiscalized"] is False
        assert receipt.json()["real_revenue_minor"] == 0
    else:
        assert receipt.status_code == 409
    assert [row["kind"] for row in client.get(path + "/audit", headers=HEADERS).json()] == ["initiated", outcome]


def test_signed_callbacks_reconcile_amount_and_bind_payment_identity(client):
    payment = initiate(client).json()
    path = "/v1/test-payments/" + payment["id"]
    assert client.post(path + "/simulate", headers=HEADERS, json=callback(payment, amount_minor=1)).status_code == 409
    assert client.post(path + "/simulate", headers=HEADERS, json=callback(payment, currency="USD")).status_code == 422
    body = json.dumps(callback(payment)).encode()
    signature = hmac.new(SECRET.encode(), payment["id"].encode() + b"." + body, hashlib.sha256).hexdigest()
    assert client.post(path + "/webhook", headers=HEADERS, content=body).status_code == 401
    signed = {**HEADERS, "X-Sandbox-Signature": signature, "Content-Type": "application/json"}
    assert client.post(path + "/webhook", headers=signed, content=body).status_code == 200
    assert client.post(path + "/webhook", headers=signed, content=body).status_code == 200
    other = initiate(client).json()
    assert client.post("/v1/test-payments/" + other["id"] + "/webhook", headers=signed, content=body).status_code == 401


def test_partial_refunds_cannot_exceed_total_or_replay_amounts(client):
    payment = initiate(client).json()
    path = "/v1/test-payments/" + payment["id"]
    refund = {"request_key": str(uuid4()), "amount_minor": 100_000}
    assert client.post(path + "/refunds", headers=HEADERS, json=refund).status_code == 409
    client.post(path + "/simulate", headers=HEADERS, json=callback(payment))
    assert client.post(path + "/refunds", headers=HEADERS, json=refund).json()["refunded_minor"] == 100_000
    assert client.post(path + "/refunds", headers=HEADERS, json=refund).json()["refunded_minor"] == 100_000
    assert client.post(path + "/refunds", headers=HEADERS, json={**refund, "amount_minor": 200_000}).status_code == 409
    assert client.post(path + "/refunds", headers=HEADERS, json={"request_key": str(uuid4()), "amount_minor": 250_001}).status_code == 409
    assert client.post(path + "/refunds", headers=HEADERS, json={"request_key": str(uuid4()), "amount_minor": 250_000}).json()["refunded_minor"] == payment["amount_minor"]
    assert len(client.get(path + "/audit", headers=HEADERS).json()) == 4


def test_concurrent_initiation_and_refund_are_exactly_once(client):
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=4) as pool:
        created = list(pool.map(lambda _: initiate(client, request_key=key), range(4)))
    assert all(result.status_code == 201 for result in created)
    assert len({result.json()["id"] for result in created}) == 1
    payment = created[0].json()
    path = "/v1/test-payments/" + payment["id"]
    event = callback(payment)
    with ThreadPoolExecutor(max_workers=4) as pool:
        callbacks = list(pool.map(lambda _: client.post(path + "/simulate", headers=HEADERS, json=event), range(4)))
    assert all(result.status_code == 200 for result in callbacks)
    refund = {"request_key": str(uuid4()), "amount_minor": 10_000}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.post(path + "/refunds", headers=HEADERS, json=refund), range(4)))
    assert all(result.status_code == 200 for result in results)
    assert client.get(path, headers=HEADERS).json()["refunded_minor"] == 10_000
    assert len(client.get(path + "/audit", headers=HEADERS).json()) == 3


def test_other_reviewer_cannot_read_old_reviewer_records(tmp_path):
    with TestClient(create_sandbox_app(settings(tmp_path))) as client:
        payment = initiate(client).json()
    other = "other-isolated-reviewer-token-" + "c" * 40
    with TestClient(create_sandbox_app(settings(tmp_path, access_token=other))) as client:
        path = "/v1/test-payments/" + payment["id"]
        assert client.get(path, headers={"Authorization": "Bearer " + other}).status_code == 404


def test_concurrent_conflicting_outcomes_and_refund_limit(client):
    payment = initiate(client).json()
    path = "/v1/test-payments/" + payment["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda status: client.post(path + "/simulate", headers=HEADERS,
                                                           json=callback(payment, status=status)), ["succeeded", "cancelled"]))
    assert sorted(result.status_code for result in outcomes) == [200, 409]
    # Use another successful payment for independently keyed concurrent refunds.
    payment = initiate(client).json()
    path = "/v1/test-payments/" + payment["id"]
    client.post(path + "/simulate", headers=HEADERS, json=callback(payment))
    with ThreadPoolExecutor(max_workers=2) as pool:
        refunds = list(pool.map(lambda _: client.post(path + "/refunds", headers=HEADERS,
                                                       json={"request_key": str(uuid4()), "amount_minor": 200_000}), range(2)))
    assert sorted(result.status_code for result in refunds) == [200, 409]
    assert client.get(path, headers=HEADERS).json()["refunded_minor"] == 200_000
    audit = client.get(path + "/audit", headers=HEADERS).json()
    assert audit[-1]["details"] == {"amount_minor": 200_000, "currency": "KES"}
