"""Explicit operator repair of missing image copies; never called by customer requests.

Updates media only. Prices, products, stock, orders and payment settings are untouched.
"""
import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

import httpx
from sqlalchemy import select

from .commerce_models import AppMedia, AppProduct
from .db import SessionLocal
from .import_store import fetch, HOSTS


def source_url(value):
    parsed = urlsplit(value)
    if parsed.path.endswith("/v1/app-media/source"):
        return parse_qs(parsed.query).get("url", [value])[0]
    return value


def image_sources(db):
    sources = set()
    for payload in db.scalars(select(AppProduct.payload)):
        for image in payload.get("images", []):
            if isinstance(image, dict) and isinstance(image.get("src"), str):
                sources.add(source_url(image["src"]))
    # Include the actual category, campaign and header imagery referenced by the app.
    root = Path(__file__).resolve().parents[2] / "src"
    for file in root.rglob("*.ts*"):
        sources.update(re.findall(r'https://(?:cakecity\.co\.ke|i[012]\.wp\.com)/[^\s"\x27`<>]+', file.read_text(encoding="utf-8")))
    return {url for url in sources if urlsplit(url).scheme == "https"
            and urlsplit(url).hostname in HOSTS
            and re.search(r"\.(?:avif|jpe?g|png|webp|gif)(?:\?|$)", url, re.I)}


def original_url(url):
    parsed = urlsplit(url)
    prefix = "/cakecity.co.ke/wp-content/uploads/"
    if parsed.hostname in {"i0.wp.com", "i1.wp.com", "i2.wp.com"} and parsed.path.startswith(prefix):
        return "https://cakecity.co.ke" + parsed.path[len("/cakecity.co.ke"):]
    return url


def valid_image(data):
    return (data.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a"))
            or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
            or (data[4:8] == b"ftyp" and (b"avif" in data[8:40] or b"avis" in data[8:40])))


async def repair():
    with SessionLocal() as db:
        sources = image_sources(db)
        copied = set(db.scalars(select(AppMedia.source_url)))
    missing = sorted(sources - copied)
    recovered, failures = [], []
    semaphore = asyncio.Semaphore(5)
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        async def recover(url):
            async with semaphore:
                last = "unavailable"
                for candidate in dict.fromkeys([url, original_url(url)]):
                    try:
                        data, mime = await fetch(client, candidate, binary=True)
                        if not valid_image(data):
                            raise ValueError("The source did not return supported image bytes")
                        with SessionLocal() as db:
                            if not db.scalar(select(AppMedia.id).where(AppMedia.source_url == url)):
                                db.add(AppMedia(id=hashlib.sha256(url.encode()).hexdigest(), source_url=url, mime=mime, data=data))
                                db.commit()
                        recovered.append(url)
                        return
                    except (httpx.HTTPError, ValueError) as error:
                        last = f"HTTP {error.response.status_code}" if isinstance(error, httpx.HTTPStatusError) else type(error).__name__
                failures.append({"url": url, "reason": last})
        await asyncio.gather(*(recover(url) for url in missing))
    return {"required_unique_images": len(sources), "already_copied": len(sources & copied),
            "recovered": len(recovered), "unavailable": len(failures), "failures": failures,
            "catalogue_and_orders_unchanged": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = asyncio.run(repair())
    if args.report:
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "failures"}))
    raise SystemExit(1 if report["unavailable"] else 0)
