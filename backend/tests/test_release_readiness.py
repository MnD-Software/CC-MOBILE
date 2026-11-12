from app.config import get_settings
from test_pesapal import system
from test_logistics import actor


def test_readiness_is_private_read_only_and_reports_unconfigured_services(system, monkeypatch):
    client = system["client"]
    assert client.get("/v1/admin/release-readiness").status_code == 403
    actor("buyer", "admin")
    for name, value in {"push_enabled": False, "password_recovery_enabled": False, "smtp_host": "", "smtp_password": ""}.items():
        monkeypatch.setattr(get_settings(), name, value)
    result = client.get("/v1/admin/release-readiness")
    assert result.status_code == 200, result.text
    assert result.json()["checks_do_not_charge"] is True
    assert result.json()["smtp_configured"] is False
    assert result.json()["push_enabled"] is False
    assert "fake-secret" not in result.text
    assert system["calls"] == []
