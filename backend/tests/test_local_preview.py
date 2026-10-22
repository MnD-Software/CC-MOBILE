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
