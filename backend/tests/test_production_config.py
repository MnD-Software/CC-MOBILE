import pytest
from fastapi.testclient import TestClient

from app.config import Settings, validate_production_settings
from app.main import app


def production(**overrides):
    return Settings(_env_file=None, **{
        "environment": "production",
        "database_url": "postgresql://test:example@localhost/cakecity",
        "jwt_secret": "a-real-random-value-is-provisioned-by-secret-management-93",
        "cors_origins": "https://staff.example.com,https://corporate.example.com",
        "redis_url": "redis://localhost:6379/0",
        **overrides,
    })


@pytest.mark.parametrize("overrides,key", [
    ({"database_url": "sqlite:///temporary.db"}, "DATABASE_URL"),
    ({"jwt_secret": "development-only-change-me"}, "JWT_SECRET"),
    ({"jwt_secret": "replace-with-a-long-random-secret"}, "JWT_SECRET"),
    ({"cors_origins": "*"}, "CORS_ORIGINS"),
    ({"cors_origins": "https://user:password@example.com"}, "CORS_ORIGINS"),
    ({"cors_origins": "https://example.com/path"}, "CORS_ORIGINS"),
    ({"cors_origins": "http://example.com"}, "CORS_ORIGINS"),
    ({"redis_url": ""}, "REDIS_URL"),
])
def test_production_rejects_unsafe_configuration(overrides, key):
    with pytest.raises(RuntimeError, match=key):
        validate_production_settings(production(**overrides))


def test_explicit_web_origins_and_native_only_configuration_are_supported():
    validate_production_settings(production())
    validate_production_settings(production(cors_origins=""))
    validate_production_settings(Settings(_env_file=None, environment="development"))


def test_direct_asgi_start_cannot_bypass_production_guards(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "get_settings", lambda: production(jwt_secret="secret"))
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        with TestClient(app):
            pytest.fail("Unsafe application must not accept requests")
