"""The one-command importer preserves live app decisions and never enables checkout."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import import_store, setup_store
from app.commerce_models import AppMedia, AppPage, AppProduct
from app.db import SessionLocal


@pytest.fixture
def tmp_path():
    # Avoid the workstation's inaccessible shared pytest temp root.
    with TemporaryDirectory(prefix="cakecity-setup-test-") as directory:
        yield Path(directory)


def export_fixture(directory):
    data = b"public test image bytes"
    identity = hashlib.sha256(data).hexdigest()
    (directory / "media").mkdir()
    (directory / "media" / identity).write_bytes(data)
    bundle = {"version": 1, "products": [{"id": 912345, "slug": "setup-test-cake", "name": "Setup test cake", "parent": 0,
               "categories": [{"id":206,"name":"Deals And Steals","slug":"deals-and-steals"},
                              {"id":98,"name":"Offers","slug":"offers"}],
               "prices": {"price": "250000", "currency_code": "KES", "currency_minor_unit": 2}}],
              "media": [{"id": identity, "source_url": "https://cakecity.co.ke/setup-test.jpg", "mime": "image/jpeg"}],
              "pages": [{"slug": "setup-test-page", "title": {"rendered": "Test page"},
                         "content": {"rendered": "<p>Public test information</p>"}}],
              "media_failures": [{"source_url": "https://cakecity.co.ke/missing.jpg"}], "page_errors": []}
    (directory / "catalogue.json").write_text(json.dumps(bundle), encoding="utf-8")


def test_one_command_import_is_idempotent_and_does_not_enable_products(tmp_path):
    export_fixture(tmp_path)
    first = setup_store.run(tmp_path)
    assert first["status"] == "imported" and first["source_image_failures"] == 1
    with SessionLocal() as db:
        row = db.get(AppProduct, 912345)
        assert row.price_minor == 250000 and not row.enabled and row.allocation == 0
        assert row.parent_id is None
        assert [c["id"] for c in row.payload["categories"]] == [206,98]
        assert db.get(AppPage, "setup-test-page").body == "Public test information"
        assert db.scalar(select(AppMedia).where(AppMedia.source_url == "https://cakecity.co.ke/setup-test.jpg"))
        row.payload = {**row.payload, "name": "Edited in app"}
        row.price_minor, row.allocation, row.enabled = 300000, 7, True
        db.commit()
    setup_store.run(tmp_path)
    with SessionLocal() as db:
        row = db.get(AppProduct, 912345)
        assert (row.payload["name"], row.price_minor, row.allocation, row.enabled) == ("Edited in app", 300000, 7, True)


def test_empty_source_aborts_before_import(tmp_path, monkeypatch):
    (tmp_path / "catalogue.json").write_text(json.dumps({"version": 1, "products": []}), encoding="utf-8")
    monkeypatch.setattr(import_store, "load", lambda _: pytest.fail("Empty export must never be imported"))
    with pytest.raises(ValueError, match="empty or invalid"):
        setup_store.run(tmp_path)


def test_download_flow_uses_temporary_directory_and_cleans_up(monkeypatch):
    directories = []
    async def download(directory):
        directories.append(directory)
        export_fixture(directory)
    monkeypatch.setattr(import_store, "export", download)
    report = setup_store.run()
    assert report["status"] == "imported"
    assert len(directories) == 1 and not directories[0].exists()


def test_build_mode_skips_existing_catalogue_without_website_requests(monkeypatch):
    setup_store.migrate()
    with SessionLocal() as db:
        if not db.get(AppProduct, 987654):
            db.add(AppProduct(id=987654,slug="existing-build-cake",payload={"name":"Existing app cake"},price_minor=10000))
            db.commit()
    monkeypatch.setattr(import_store, "export", lambda _: pytest.fail("An existing catalogue must not contact the website"))
    monkeypatch.setattr(import_store, "load", lambda _: pytest.fail("An existing catalogue must not be reimported"))
    assert setup_store.run(if_empty=True) == {"status":"skipped","reason":"catalogue_exists"}


def test_build_mode_imports_when_database_has_no_products(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool
    from sqlalchemy.orm import sessionmaker
    from app.db import Base
    engine = create_engine("sqlite://",poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine,expire_on_commit=False)
    monkeypatch.setattr(setup_store,"migrate",lambda:None)
    monkeypatch.setattr(setup_store,"SessionLocal",sessions)
    monkeypatch.setattr(import_store,"SessionLocal",sessions)
    async def download(directory):
        export_fixture(directory)
    monkeypatch.setattr(import_store,"export",download)
    try:
        assert setup_store.run(if_empty=True)["status"] == "imported"
        assert setup_store.run(if_empty=True)["status"] == "skipped"
    finally:
        engine.dispose()
