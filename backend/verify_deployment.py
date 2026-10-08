"""Read-only deployment check: python verify_deployment.py https://your-service.onrender.com"""
import json
import sys
from urllib.request import urlopen


def verify(base):
    base = base.rstrip("/")
    def read(path):
        with urlopen(base + path, timeout=90) as response:
            return json.load(response)
    health = read("/health")
    paths = read("/openapi.json")["paths"]
    required = ["/v1/club", "/v1/club/benefits", "/v1/club/transactions",
        "/v1/account/addresses", "/v1/account/addresses/{address_id}",
        "/v1/account/celebrations", "/v1/account/enquiries"]
    missing = [path for path in required if path not in paths]
    if missing:
        raise RuntimeError("Old/incomplete backend deployed; missing routes: " + ", ".join(missing))
    readiness = read("/ready/db")
    print(json.dumps({"release": health.get("release"), "database": readiness, "club_routes": "present"}))
    print("Route/database checks passed. Authenticated points, coupon issuance and refund checks still required.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python verify_deployment.py https://your-service.onrender.com")
    try:
        verify(sys.argv[1])
    except Exception as error:
        raise SystemExit(str(error))
