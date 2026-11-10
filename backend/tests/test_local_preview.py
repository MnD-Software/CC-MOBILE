import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from app.local_preview import create_app


def test_local_preview_rejects_production_without_opening_database(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="dedicated artifacts directory"):
        create_app()


def test_local_preview_rejects_unrelated_database_directory(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    with TemporaryDirectory(prefix="cakecity-preview-isolation-") as directory:
        monkeypatch.setenv("CAKECITY_LOCAL_PREVIEW_DIR", directory)
        with pytest.raises(RuntimeError, match="dedicated artifacts directory"):
            create_app()
        assert not (Path(directory) / "review.db").exists()


@pytest.mark.parametrize("credential", [
    "PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET", "PESAPAL_ACCOUNTS_JSON",
    "PESAPAL_PUBLIC_URL", "APP_PUBLIC_URL", "RENDER_EXTERNAL_URL", "SALES_INGEST_SECRET",
    "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_BROWSER_KEY",
])
def test_local_review_rejects_inherited_integrations_before_database_access(monkeypatch, credential):
    directory = Path(__file__).resolve().parents[2] / "artifacts" / "local-preview"
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("CAKECITY_LOCAL_PREVIEW_DIR", str(directory))
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + (directory / "review.db").as_posix())
    for key in (
        "WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET", "CLUB_EVENT_SECRET",
        "WOOCOMMERCE_WEBHOOK_SECRET", "REDIS_URL", "PESAPAL_CONSUMER_KEY",
        "PESAPAL_CONSUMER_SECRET", "PESAPAL_ACCOUNTS_JSON", "PESAPAL_PUBLIC_URL",
        "APP_PUBLIC_URL", "RENDER_EXTERNAL_URL", "SALES_INGEST_SECRET",
        "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_BROWSER_KEY",
    ):
        monkeypatch.setenv(key, "")
    monkeypatch.setenv("APP_PUBLIC_URL", "http://127.0.0.1:8010")
    monkeypatch.setenv(credential, "inherited-test-value")
    with pytest.raises(RuntimeError, match="Live integration credentials are forbidden"):
        create_app()
