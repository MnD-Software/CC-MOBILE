"""Explicit one-time export/import. Never called by customer requests or server startup."""
import argparse
import asyncio
import hashlib
import json
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select

from .commerce_models import AppMedia, AppPage, AppProduct
from .db import SessionLocal

SOURCE = "https://cakecity.co.ke"
HOSTS = {"cakecity.co.ke", "www.cakecity.co.ke", "i0.wp.com", "i1.wp.com", "i2.wp.com"}


class TextContent(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.hidden += 1
        if tag in ("p", "div", "li", "h1", "h2", "h3", "br", "tr"):
            self.text.append("\n")
        if tag == "img":
            alt = dict(attrs).get("alt", "")
            if alt:
                self.text.append(alt)
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.hidden = max(0, self.hidden-1)
        if tag in ("p", "div", "li", "h1", "h2", "h3", "tr"):
            self.text.append("\n")
    def handle_data(self, value):
        if not self.hidden:
            self.text.append(value)


def plain(value):
    parser = TextContent()
    parser.feed(value)
    return "\n\n".join(line.strip() for line in "".join(parser.text).splitlines() if line.strip())


class MainContent(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.capturing = False
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.capturing = True
        if self.capturing:
            self.parts.append(self.get_starttag_text())
    def handle_endtag(self, tag):
        if self.capturing:
            self.parts.append("</" + tag + ">")
        if tag == "main":
            self.capturing = False
    def handle_data(self, value):
        if self.capturing:
            self.parts.append(value)


async def fetch(client, url, binary=False, html=False):
    # Validate every redirect; this operator import never follows arbitrary hosts.
    for _ in range(5):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError("Unapproved import source")
        async with client.stream("GET", url) as response:
            if response.is_redirect:
                from urllib.parse import urljoin
                url = urljoin(url, response.headers["location"])
                continue
            response.raise_for_status()
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > 12_000_000:
                    raise ValueError("Import asset exceeds size limit")
            if binary:
                mime = response.headers.get("content-type", "").split(";")[0]
                if mime not in ("image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"):
                    raise ValueError("Unsupported image format")
                return bytes(data), mime
            return bytes(data).decode("utf-8", errors="replace") if html else json.loads(data)
    raise ValueError("Too many source redirects")


async def export(directory):
    directory.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=45, follow_redirects=False) as client:
        products = []
        for page in range(1, 100):
            values = await fetch(client, f"{SOURCE}/wp-json/wc/store/v1/products?per_page=100&page={page}")
            if not isinstance(values, list):
                raise ValueError("Invalid product export")
            products.extend(values)
            print(f"Copied catalogue page {page}: {len(products)} product records so far.", flush=True)
            if len(values) < 100:
                break
        ids = sorted({v["id"] for p in products for v in p.get("variations", [])})
        for start in range(0, len(ids), 100):
            batch = ",".join(map(str, ids[start:start+100]))
            products.extend(await fetch(client, f"{SOURCE}/wp-json/wc/store/v1/products?type=variation&include={batch}&per_page=100"))
            print(f"Copied variation batch {start//100+1}: {len(products)} total product/variation records.", flush=True)
        pages = []
        page_errors = []
        try:
            for index in range(1, 100):
                values = await fetch(client, f"{SOURCE}/wp-json/wp/v2/pages?per_page=100&page={index}")
                pages.extend(values)
                if len(values) < 100:
                    break
        except (httpx.HTTPError, ValueError) as error:
            page_errors.append(type(error).__name__)
        if not pages:
            for slug in ("terms-and-conditions", "about-us", "shipping", "locations-branches", "return-exchange-policy", "privacy-policy"):
                try:
                    source = await fetch(client, f"{SOURCE}/{slug}/", html=True)
                    parser = MainContent()
                    parser.feed(source)
                    body = "".join(parser.parts)
                    if not plain(body).strip():
                        raise ValueError("No main page content")
                    pages.append({"slug": slug, "title": {"rendered": slug.replace("-", " ").title()},
                                  "content": {"rendered": body}, "link": f"{SOURCE}/{slug}/"})
                except (httpx.HTTPError, ValueError) as error:
                    page_errors.append(slug + ": " + type(error).__name__)
        # Include static owner-provided imagery that the app already references.
        urls = {image["src"] for product in products for image in product.get("images", []) if image.get("src")}
        import re
        source_root = Path(__file__).resolve().parents[2] / "src"
        for path in source_root.rglob("*.ts*"):
            urls.update(re.findall(r'https://(?:cakecity\.co\.ke|i[012]\.wp\.com)/[^\s"\x27`<>]+', path.read_text(encoding="utf-8")))
        urls = {u for u in urls if any(ext in u.lower() for ext in (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"))}
        media, failures = [], []
        print(f"Copying {len(urls)} image sources into app storage…", flush=True)
        semaphore = asyncio.Semaphore(6)
        media_dir = directory / "media"
        media_dir.mkdir(exist_ok=True)
        async def mirror(url):
            async with semaphore:
                try:
                    data, mime = await fetch(client, url, binary=True)
                    identity = hashlib.sha256(data).hexdigest()
                    (media_dir / identity).write_bytes(data)
                    media.append({"id": identity, "source_url": url, "mime": mime, "bytes": len(data)})
                except (httpx.HTTPError, ValueError) as error:
                    failures.append({"source_url": url, "reason": type(error).__name__})
                completed = len(media) + len(failures)
                if completed % 25 == 0 or completed == len(urls):
                    print(f"Images checked: {completed}/{len(urls)}; copied: {len(media)}; unavailable: {len(failures)}.", flush=True)
        await asyncio.gather(*(mirror(url) for url in sorted(urls)))
    bundle = {"version": 1, "source": SOURCE, "products": products, "pages": pages, "media": media,
              "media_failures": failures, "page_errors": page_errors}
    (directory / "catalogue.json").write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"products": len(products), "pages": len(pages), "images": len(media), "image_failures": len(failures), "page_errors": page_errors}))


def load(directory):
    bundle = json.loads((directory / "catalogue.json").read_text(encoding="utf-8"))
    parents = {v["id"]: p["id"] for p in bundle["products"] for v in p.get("variations", [])}
    with SessionLocal() as db:
        for payload in bundle["products"]:
            payload = dict(payload)
            identity = int(payload["id"])
            if identity in parents:
                parent_payload = next(p for p in bundle["products"] if p["id"] == parents[identity])
                option = next((v for v in parent_payload.get("variations", []) if v["id"] == identity), {})
                payload["variation_attributes"] = option.get("attributes", [])
            prices = payload.get("prices", {})
            price = prices.get("price", "")
            amount = int(price) if str(price).isdigit() and prices.get("currency_code") == "KES" and prices.get("currency_minor_unit") == 2 else None
            row = db.get(AppProduct, identity)
            if row is None:
                db.add(AppProduct(id=identity, slug=(payload["slug"] + "--v" + str(identity)) if (parents.get(identity) or payload.get("parent")) else payload["slug"], parent_id=parents.get(identity) or payload.get("parent"),
                                  payload=payload, price_minor=amount, enabled=False, allocation=0))
            # Reimport never overwrites app prices, stock allocations or editorial changes.
        for image in bundle["media"]:
            data = (directory / "media" / image["id"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != image["id"]:
                raise ValueError("Media checksum mismatch")
            # Identical files can have several source URLs; retain a distinct source mapping.
            identity = hashlib.sha256(image["source_url"].encode()).hexdigest()
            if not db.get(AppMedia, identity):
                db.add(AppMedia(id=identity, source_url=image["source_url"], mime=image["mime"], data=data))
        for page in bundle["pages"]:
            if not db.get(AppPage, page["slug"]):
                html = page.get("content", {}).get("rendered", "")
                db.add(AppPage(slug=page["slug"], title=plain(page.get("title", {}).get("rendered", "")), body=plain(html),
                               source_url=page.get("link", ""), revision=hashlib.sha256(html.encode()).hexdigest()))
        db.commit()
    print("App catalogue, pages and media imported. Stock allocation and delivery policies require operator configuration.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("export", "import"))
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.action == "export":
        asyncio.run(export(args.directory))
    else:
        from .migrate import migrate
        migrate()
        load(args.directory)
