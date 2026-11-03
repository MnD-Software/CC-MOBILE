"""One operator command to copy the public catalogue into the app database.

Never called by startup or customer requests. No payment or checkout enablement.
"""
import argparse
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import func, select

from . import import_store
from .commerce_models import AppMedia, AppPage, AppProduct
from .config import get_settings, validate_production_settings
from .db import SessionLocal
from .migrate import migrate


def import_directory(directory: Path):
    bundle = json.loads((directory / "catalogue.json").read_text(encoding="utf-8"))
    if bundle.get("version") != 1 or not isinstance(bundle.get("products"), list) or not bundle["products"]:
        raise ValueError("The source catalogue is empty or invalid. Nothing was imported.")
    for name in ("pages", "media", "media_failures", "page_errors"):
        if not isinstance(bundle.get(name, []), list):
            raise ValueError("The source catalogue is invalid. Nothing was imported.")
    print("Saving products, copied media and information pages to the app database…", flush=True)
    import_store.load(directory)
    with SessionLocal() as db:
        counts = {"products_and_variations": db.scalar(select(func.count()).select_from(AppProduct)),
                  "copied_image_mappings": db.scalar(select(func.count()).select_from(AppMedia)),
                  "information_pages": db.scalar(select(func.count()).select_from(AppPage))}
    report = {"status": "imported", **counts,
              "source_image_failures": len(bundle.get("media_failures", [])),
              "source_page_errors": len(bundle.get("page_errors", []))}
    print(json.dumps(report), flush=True)
    print("Catalogue copy complete. Existing app edits and stock allocations were preserved.", flush=True)
    print("Valid priced products use made-to-order purchasing. Checkout still requires confirmed fulfilment rules. No payment was attempted.", flush=True)
    print("Manage the imported catalogue at your app backend's /admin address.", flush=True)
    return report


def run(directory: Path | None = None, *, if_empty: bool = False):
    validate_production_settings(get_settings())
    print("Preparing the app database. Existing records will be preserved.", flush=True)
    migrate()
    if if_empty:
        with SessionLocal() as db:
            exists = db.scalar(select(AppProduct.id).limit(1)) is not None
        if exists:
            print("App catalogue already exists. Skipping copy; no website request was made.", flush=True)
            return {"status": "skipped", "reason": "catalogue_exists"}
    if directory is not None:
        return import_directory(directory)
    # Render's temporary disk is used only to stage public source files. Records
    # and image bytes are committed to the configured app database before cleanup.
    with TemporaryDirectory(prefix="cakecity-store-setup-") as temporary:
        destination = Path(temporary)
        print("Copying Cake City's public catalogue and images. This can take several minutes…", flush=True)
        asyncio.run(import_store.export(destination))
        return import_directory(destination)


def main():
    parser = argparse.ArgumentParser(description="Copy Cake City's public catalogue, media and pages into the independent app database")
    parser.add_argument("--from-directory", type=Path, help="Use an existing export directory instead of downloading the public catalogue")
    parser.add_argument("--if-empty", action="store_true", help="Skip copying when the app already has products (for Render builds)")
    args = parser.parse_args()
    run(args.from_directory, if_empty=args.if_empty)


if __name__ == "__main__":
    main()
