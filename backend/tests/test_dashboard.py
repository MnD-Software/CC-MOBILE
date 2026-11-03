"""Dashboard permissions, durable edits and checkout effects (isolated test DB)."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.commerce_models import AppCoupon, AppProduct
from app.main import app
from app.routes_club import member
from test_pesapal import system, quote, place


def admin():
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="admin")


def product_input(row=None, **overrides):
    return {"revision": row["revision"] if row else 0, "name": "Dashboard cake", "slug": "dashboard-cake",
            "description": "Freshly made", "short_description": "Celebration cake", "price_minor": 450000,
            "allocation": 12, "enabled": True, "image_urls": [], "categories": [], "parent_id": None, **overrides}


def promotion_input(**overrides):
    return {"amount_minor": 50000, "minimum_minor": 100000, "usage_limit": 5, "enabled": True, **overrides}


def test_dashboard_static_shell_and_no_arbitrary_files(system):
    client=system["client"]
    response=client.get("/admin")
    assert response.status_code == 200 and "APP MANAGEMENT" in response.text
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert client.get("/admin/assets/dashboard.js").status_code == 200
    assert client.get("/admin/assets/config.py").status_code == 404
    assert client.get("/v1/admin/dashboard/products").status_code == 403
    assert client.get("/v1/admin/dashboard/promotions").status_code == 403
    assert client.post("/v1/admin/dashboard/products",json=product_input()).status_code == 403
    assert client.put("/v1/admin/dashboard/promotions/test",json=promotion_input()).status_code == 403


def test_create_edit_search_and_quote_new_product(system):
    admin();client=system["client"]
    created=client.post("/v1/admin/dashboard/products",json=product_input())
    assert created.status_code == 201,created.text
    row=created.json();identity=row["id"]
    assert client.get("/v1/admin/dashboard/products",params={"search":"DASHBOARD"}).json()["total"] == 1
    assert client.get("/v1/admin/dashboard/products",params={"search":str(identity)}).json()["items"][0]["id"] == identity
    saved=client.put(f"/v1/admin/dashboard/products/{identity}",json=product_input(row,price_minor=500000))
    assert saved.status_code == 200 and saved.json()["revision"] == 2
    assert client.put(f"/v1/admin/dashboard/products/{identity}",json=product_input(row)).status_code == 409
    public=client.get("/v1/catalogue/products",params={"include":str(identity)}).json()[0]
    assert public["prices"]["regular_price"] == "500000" and public["is_purchasable"]
    system["payload"]["items"][0]["product_id"]=identity
    assert quote(system)["total_minor"] == 500000


def test_stock_floor_duplicate_slug_and_disabling(system):
    admin();client=system["client"]
    assert place(system).status_code == 200
    row=client.get("/v1/admin/dashboard/products").json()["items"][0]
    data=product_input(row,slug="test-cake",allocation=0)
    assert client.put("/v1/admin/dashboard/products/12",json=data).status_code == 409
    assert client.post("/v1/admin/dashboard/products",json=product_input(slug="test-cake")).status_code == 409
    data.update(allocation=10,enabled=False)
    assert client.put("/v1/admin/dashboard/products/12",json=data).status_code == 200
    assert client.post("/v1/app-checkout/quote",json=system["payload"]).status_code == 409


def test_product_media_and_variation_protection(system):
    admin();client=system["client"]
    assert client.post("/v1/admin/dashboard/products",json=product_input(image_urls=["https://cakecity.co.ke/image.jpg"])).status_code == 422
    assert client.post("/v1/admin/dashboard/products",json=product_input(parent_id=12)).status_code == 422
    assert client.post("/v1/admin/dashboard/products",json=product_input(price_minor=-1)).status_code == 422


def test_promotion_reaches_quote_and_preserves_usage(system):
    admin();client=system["client"]
    r=client.put("/v1/admin/dashboard/promotions/APP-SAVE",json=promotion_input())
    assert r.status_code == 200,r.text
    row=r.json();assert row["code"] == "app-save"
    system["payload"]["coupon_code"]="APP-SAVE"
    assert quote(system)["discount_minor"] == 50000
    assert place(system).status_code == 200
    assert client.put("/v1/admin/dashboard/promotions/app-save",json=promotion_input()).status_code == 409
    r=client.put("/v1/admin/dashboard/promotions/app-save",json=promotion_input(version=row["version"],enabled=False))
    assert r.status_code == 200 and r.json()["reserved"] == 1
    assert client.post("/v1/app-checkout/quote",json=system["payload"]).status_code == 409


def test_expired_and_minimum_spend_promotions_are_rejected(system):
    admin();client=system["client"]
    for code,data in (("expired",promotion_input(expires_at=(datetime.now(UTC)-timedelta(days=1)).isoformat())),
                      ("minimum",promotion_input(minimum_minor=999999))):
        assert client.put(f"/v1/admin/dashboard/promotions/{code}",json=data).status_code == 200
        system["payload"]["coupon_code"]=code
        assert client.post("/v1/app-checkout/quote",json=system["payload"]).status_code == 409


def test_member_coupons_and_usage_cannot_be_overwritten(system):
    admin();client=system["client"]
    with Session(system["engine"]) as db:
        db.add(AppCoupon(code="reward",customer_id="buyer",amount_minor=100,usage_limit=1))
        db.add(AppCoupon(code="used",amount_minor=100,usage_limit=5,uses=2,reserved=1))
        db.commit()
    rows={r["code"]:r for r in client.get("/v1/admin/dashboard/promotions").json()}
    assert client.put("/v1/admin/dashboard/promotions/reward",json=promotion_input(version=rows["reward"]["version"])).status_code == 409
    assert client.put("/v1/admin/dashboard/promotions/used",json=promotion_input(version=rows["used"]["version"],usage_limit=2)).status_code == 409


def test_role_change_is_checked_on_every_request(system):
    admin();client=system["client"]
    assert client.get("/v1/admin/dashboard/products").status_code == 200
    app.dependency_overrides[member]=lambda:SimpleNamespace(id="buyer",role="marketing_manager")
    assert client.get("/v1/admin/dashboard/products").status_code == 403
    assert client.get("/v1/admin/content").status_code == 200
