"""Optional reporting job. Never imported or run by app customer requests/startup."""
import argparse
import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

import httpx
from sqlalchemy import select

from .app_commerce import issue
from .commerce_models import CommerceIssue, SalesRecord
from .config import get_settings
from .db import SessionLocal


def money(value):
    amount = Decimal(str(value))*100
    if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value() or amount > 2_000_000_000:
        raise ValueError("Invalid website sales amount")
    return int(amount)


async def synchronize(db, days=7):
    s = get_settings()
    imported, skipped = 0, 0
    if not s.woocommerce_consumer_key or not s.woocommerce_consumer_secret:
        issue(db, "website-sales-sync", "reporting_credentials_missing", channel="website")
        db.commit()
        return {"status": "not_configured", "channel": "website", "imported": 0}
    try:
        async with httpx.AsyncClient(timeout=25, auth=(s.woocommerce_consumer_key, s.woocommerce_consumer_secret), follow_redirects=False) as client:
            for page in range(1, 1001):
                response = await client.get(s.woocommerce_api_url.rstrip("/") + "/orders", params={
                    "per_page": 100, "page": page, "modified_after": (datetime.now(UTC)-timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S"),
                    "orderby": "modified", "order": "asc"})
                response.raise_for_status()
                orders = response.json()
                if not isinstance(orders, list):
                    raise ValueError("Invalid website reporting payload")
                for order in orders:
                    # Never double count a copied/migration app order as website revenue.
                    if (str(order.get("number", "")).startswith("APP-") or order.get("payment_method") == "cakecity_pesapal"
                            or any(meta.get("key") in ("_cakecity_app_reference", "_cakecity_pesapal_reference") or
                                   (meta.get("key") == "_cakecity_channel" and meta.get("value") == "app") for meta in order.get("meta_data", []))):
                        skipped += 1
                        continue
                    if not order.get("date_paid_gmt"):
                        continue
                    reference = "WEB-" + str(int(order["id"]))
                    if order.get("currency") != "KES":
                        issue(db, reference, "unsupported_reporting_currency", channel="website")
                        continue
                    paid = money(order["total"])
                    reversed_minor = sum(money(abs(Decimal(str(refund["total"])))) for refund in order.get("refunds", []))
                    if reversed_minor > paid:
                        issue(db, reference, "refund_reporting_mismatch", channel="website")
                        continue
                    occurred = datetime.fromisoformat(order["date_paid_gmt"].replace("Z", "+00:00"))
                    modified = datetime.fromisoformat(order["date_modified_gmt"].replace("Z", "+00:00"))
                    occurred = occurred.replace(tzinfo=UTC) if occurred.tzinfo is None else occurred
                    modified = modified.replace(tzinfo=UTC) if modified.tzinfo is None else modified
                    version = int(modified.timestamp())
                    row = db.scalar(select(SalesRecord).where(SalesRecord.channel == "website", SalesRecord.reference == reference,
                                                            SalesRecord.environment == "live").with_for_update())
                    if row:
                        if version < row.version:
                            continue
                        if version == row.version and (row.paid_minor, row.reversed_minor) != (paid, reversed_minor):
                            issue(db, reference, "sales_version_conflict", channel="website")
                            continue
                        row.paid_minor, row.reversed_minor, row.version = paid, reversed_minor, version
                    else:
                        db.add(SalesRecord(id=str(uuid4()), channel="website", reference=reference, environment="live",
                            paid_minor=paid, reversed_minor=reversed_minor, version=version, occurred_at=occurred))
                    imported += 1
                db.commit()
                if len(orders) < 100:
                    break
        for row in db.scalars(select(CommerceIssue).where(CommerceIssue.channel == "website", CommerceIssue.reference == "website-sales-sync")):
            row.status = "resolved"
        db.commit()
        return {"status": "ok", "channel": "website", "imported": imported, "app_copies_skipped": skipped}
    except (httpx.HTTPError, ValueError, InvalidOperation, TypeError, KeyError):
        db.rollback()
        issue(db, "website-sales-sync", "website_reporting_unavailable", channel="website")
        db.commit()
        return {"status": "delayed", "channel": "website", "imported": imported,
                "message": "Website reporting will retry separately. App commerce remains independent."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    if not 1 <= args.days <= 3650:
        parser.error("days must be between 1 and 3650")
    with SessionLocal() as db:
        print(asyncio.run(synchronize(db, args.days)))
