"""Deployment gates reject stale services without initiating payments."""
from copy import deepcopy

import pytest

import verify_deployment as checker
from app.main import app


@pytest.fixture
def responses(monkeypatch):
    payloads = {
        "/health": {"status": "ok", "service": "cakecity-api", "website_dependency": False, "release": "test"},
        "/openapi.json": deepcopy(app.openapi()),
        "/ready/db": {"status": "ready", "database": "ok"},
        "/v1/catalogue/products?per_page=1": [{"id": 1}],
        "/v1/pages": [{"slug": "privacy-policy"}],
        "/v1/payments/pesapal/config": {"available": True, "provider": "pesapal-api3", "checkout_owner": "app", "environment": "live", "website_dependency": False},
        "/v1/app-checkout/options": {"pickup_enabled": True},
    }
    calls = []

    def read(base, path):
        calls.append(path)
        return deepcopy(payloads[path])

    monkeypatch.setattr(checker, "read_json", read)
    return payloads, calls


def test_current_api_passes_and_only_reads_public_configuration(responses):
    _, calls = responses
    result = checker.verify("http://127.0.0.1:8010/")
    assert result["configuration_blockers"] == []
    assert result["required_routes"] == "present"
    assert "remain unverified" in result["limits"]
    assert len(calls) == 7
    assert not any("/start" in path or "/verify" in path or "/admin" in path for path in calls)


def test_old_club_only_deployment_is_rejected(responses):
    payloads, _ = responses
    del payloads["/openapi.json"]["paths"]["/v1/app-checkout/quote"]["post"]
    with pytest.raises(RuntimeError, match="POST /v1/app-checkout/quote"):
        checker.verify("https://api.example.com")


def test_http_200_with_unready_database_is_rejected(responses):
    payloads, _ = responses
    payloads["/ready/db"] = {"status": "starting", "database": "unavailable"}
    with pytest.raises(RuntimeError, match="database is not ready"):
        checker.verify("https://api.example.com")


def test_incomplete_business_configuration_is_reported(responses):
    payloads, _ = responses
    payloads["/v1/catalogue/products?per_page=1"] = []
    payloads["/v1/pages"] = []
    payloads["/v1/payments/pesapal/config"].update(available=False, environment="sandbox")
    payloads["/v1/app-checkout/options"] = {"distance_delivery": {"enabled": True, "maps_ready": False}}
    result = checker.verify("https://api.example.com")
    assert len(result["configuration_blockers"]) == 6
    assert result["checkout_configured"] is False


def test_strict_cli_fails_for_incomplete_configuration(responses, monkeypatch, capsys):
    payloads, _ = responses
    payloads["/v1/pages"] = []
    monkeypatch.setattr("sys.argv", ["verify_deployment.py", "https://api.example.com", "--require-checkout"])
    with pytest.raises(SystemExit, match="Checkout configuration checks failed"):
        checker.main()
    assert "privacy policy is not published" in capsys.readouterr().out


@pytest.mark.parametrize("base", ["http://remote.example.com", "https://user:password@example.com", "https://example.com?secret=value"])
def test_unsafe_origins_are_rejected_before_any_requests(base, responses):
    _, calls = responses
    with pytest.raises(RuntimeError, match="HTTPS backend URL"):
        checker.verify(base)
    assert calls == []
