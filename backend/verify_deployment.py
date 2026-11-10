"""Read-only independent-app checks. Never submits orders or payments."""
import argparse
import json
from urllib.parse import urlsplit
from urllib.request import urlopen


REQUIRED_ROUTES = {
    "/v1/club/celebrations/{identity}/ack": {"post"},
    "/v1/account/notifications": {"get"},
    "/v1/account/notifications/devices": {"post", "delete"},
    "/v1/account/notifications/preferences": {"get", "patch"},
    "/v1/account/notifications/{identity}/read": {"post"},
    "/v1/app-orders/{reference}/review": {"get", "post"},
    "/v1/auth/mobile/login": {"post"},
    "/v1/club": {"get"},
    "/v1/club/benefits": {"get"},
    "/v1/club/transactions": {"get"},
    "/v1/account/addresses": {"get", "post"},
    "/v1/account/celebrations": {"get"},
    "/v1/account/enquiries": {"get"},
    "/v1/content": {"get"},
    "/v1/catalogue/products": {"get"},
    "/v1/catalogue/categories": {"get"},
    "/v1/pages": {"get"},
    "/v1/pages/{slug}": {"get"},
    "/v1/app-checkout/options": {"get"},
    "/v1/app-checkout/quote": {"post"},
    "/v1/app-checkout/recovery": {"get"},
    "/v1/app-orders": {"get", "post"},
    "/v1/app-orders/{reference}": {"get"},
    "/v1/app-orders/{reference}/receipt": {"get"},
    "/v1/payments/pesapal/config": {"get"},
    "/v1/payments/pesapal/orders/{reference}/start": {"post"},
    "/v1/payments/pesapal/orders/{reference}/verify": {"post"},
    "/v1/payments/pesapal/ipn": {"get"},
    "/v1/payments/pesapal/return": {"get"},
    "/v1/app-delivery/quote": {"post"},
    "/v1/admin/app-policy": {"get", "put"},
    "/v1/admin/app-orders": {"get"},
    "/v1/admin/app-orders/{reference}": {"get", "patch"},
    "/v1/admin/app-orders/{reference}/dispatch": {"put"},
    "/v1/admin/channel-sales": {"get"},
    "/v1/admin/commerce-issues": {"get"},
    "/v1/admin/dashboard/products": {"get", "post"},
    "/v1/admin/dashboard/club": {"get"},
}


def read_json(base, path):
    with urlopen(base + path, timeout=45) as response:
        return json.load(response)


def verify(base):
    base = base.rstrip("/")
    origin = urlsplit(base)
    local = origin.hostname in ("localhost", "127.0.0.1", "::1")
    if (origin.scheme != "https" and not (local and origin.scheme == "http")) or (
        not origin.hostname or origin.username or origin.password or origin.query or origin.fragment
    ):
        raise RuntimeError("Use an HTTPS backend URL, or HTTP on localhost, without credentials or query parameters.")
    health = read_json(base, "/health")
    if health.get("status") != "ok" or health.get("service") != "cakecity-api" or health.get("website_dependency") is not False:
        raise RuntimeError("The independent Cake City app backend is not healthy or is not deployed.")
    paths = read_json(base, "/openapi.json")["paths"]
    missing = [f"{method.upper()} {path}" for path, methods in REQUIRED_ROUTES.items()
               for method in sorted(methods) if method not in paths.get(path, {})]
    if missing:
        raise RuntimeError("Old/incomplete backend deployed; missing routes: " + ", ".join(missing))
    readiness = read_json(base, "/ready/db")
    if readiness.get("status") != "ready" or readiness.get("database") != "ok":
        raise RuntimeError("The app database is not ready.")
    products = read_json(base, "/v1/catalogue/products?per_page=1")
    pages = read_json(base, "/v1/pages")
    payment = read_json(base, "/v1/payments/pesapal/config")
    options = read_json(base, "/v1/app-checkout/options")
    if not isinstance(products, list) or not isinstance(pages, list):
        raise RuntimeError("Unexpected catalogue/pages response; verify the deployed API version.")
    if payment.get("provider") != "pesapal-api3" or payment.get("checkout_owner") != "app" or payment.get("website_dependency") is not False:
        raise RuntimeError("Checkout is not using the independent app payment contract.")
    blockers = []
    if not products:
        blockers.append("The app catalogue is empty.")
    if not any(page.get("slug") == "privacy-policy" for page in pages):
        blockers.append("The app privacy policy is not published.")
    if payment.get("available") is not True:
        blockers.append("Pesapal settings or confirmed checkout policy are unavailable.")
    if payment.get("environment") != "live":
        blockers.append("Pesapal is not configured for the live environment.")
    distance = options.get("distance_delivery", {})
    delivery_ready = bool(distance.get("enabled") and distance.get("maps_ready"))
    if not options.get("pickup_enabled") and not delivery_ready and not options.get("delivery_zones"):
        blockers.append("No pickup or delivery option is configured.")
    if distance.get("enabled") and not distance.get("maps_ready"):
        blockers.append("Distance delivery is enabled but the server Maps key is missing.")
    return {
        "release": health.get("release"), "database": readiness,
        "required_routes": "present", "catalogue_nonempty": bool(products),
        "payment_environment": payment.get("environment"),
        "checkout_configured": payment.get("available") is True,
        "configuration_blockers": blockers,
        "limits": "Read-only configuration checks only. Authenticated checkout, merchant activation, settlement and native-device payment remain unverified.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url")
    parser.add_argument("--require-checkout", action="store_true",
                        help="Fail for incomplete catalogue, privacy, live payment or fulfilment configuration.")
    args = parser.parse_args()
    report = verify(args.base_url)
    print(json.dumps(report, indent=2))
    if args.require_checkout and report["configuration_blockers"]:
        raise SystemExit("Checkout configuration checks failed; see configuration_blockers above.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
