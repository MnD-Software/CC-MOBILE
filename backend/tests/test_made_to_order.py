"""Made-to-order purchases use real order/payment records without fictional stock."""
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.commerce_models import AppProduct, AppCoupon, AppOrder, SalesRecord
from app.migrate import configure_made_to_order
from test_pesapal import system, quote, place, start, ipn, verify


def configure(system):
    with Session(system["engine"]) as db:
        row=db.get(AppProduct,12)
        row.payload={**row.payload,"order_mode":"made_to_order"}
        row.allocation=0
        db.commit()


def test_zero_stock_made_to_order_can_be_quoted_and_ordered_repeatedly(system):
    configure(system)
    system["payload"]["items"][0]["quantity"]=20
    q=quote(system)
    assert q["lines"][0]["order_mode"] == "made_to_order"
    assert place(system,q).status_code == 200
    assert place(system).status_code == 200
    product=system["client"].get("/v1/catalogue/products").json()[0]
    assert product["order_mode"] == "made_to_order" and product["is_in_stock"] and product["is_purchasable"]
    with Session(system["engine"]) as db:
        row=db.get(AppProduct,12)
        assert (row.allocation,row.reserved,row.sold) == (0,0,0)


def test_paid_made_to_order_preserves_receipt_sales_and_stock(system):
    configure(system)
    assert start(system).status_code == 200
    assert ipn(system).status_code == 200
    assert ipn(system).status_code == 200
    assert verify(system).json()["payment_state"] == "completed"
    assert system["client"].get(f"/v1/app-orders/{system['reference']}/receipt").status_code == 200
    with Session(system["engine"]) as db:
        row=db.get(AppProduct,12)
        assert (row.allocation,row.reserved,row.sold) == (0,0,0)
        assert len(list(db.scalars(select(SalesRecord)))) == 1


def test_failed_made_to_order_releases_coupon_without_stock_reservation(system):
    configure(system)
    with Session(system["engine"]) as db:
        db.add(AppCoupon(code="made-order",amount_minor=50000,usage_limit=5))
        db.commit()
    system["payload"]["coupon_code"]="made-order"
    system["amount"]=2000
    assert start(system).status_code == 200
    system["state"]=2
    assert ipn(system).status_code == 200
    with Session(system["engine"]) as db:
        assert db.get(AppCoupon,"made-order").reserved == 0
        assert db.get(AppProduct,12).reserved == 0


def test_disabling_made_to_order_still_blocks_purchases(system):
    configure(system)
    with Session(system["engine"]) as db:
        db.get(AppProduct,12).enabled=False
        db.commit()
    assert system["client"].post("/v1/app-checkout/quote",json=system["payload"]).status_code == 409


def test_migration_enables_unedited_imports_preserves_admin_choices_and_is_idempotent(system):
    with Session(system["engine"]) as db:
        first=db.get(AppProduct,12)
        first.enabled=False;first.allocation=0
        db.add(AppProduct(id=23,slug="disabled-by-admin",payload={"type":"simple"},price_minor=10000,allocation=0,enabled=False,revision=2))
        db.add(AppProduct(id=24,slug="explicit-stock",payload={"order_mode":"stocked"},price_minor=10000,allocation=5,enabled=True))
        db.commit()
    assert configure_made_to_order(system["engine"]) == 2
    assert configure_made_to_order(system["engine"]) == 0
    with Session(system["engine"]) as db:
        assert db.get(AppProduct,12).enabled
        assert not db.get(AppProduct,23).enabled
        assert db.get(AppProduct,24).payload["order_mode"] == "stocked"


def test_existing_reserved_order_still_completes_after_product_mode_migration(system):
    assert start(system).status_code == 200
    assert configure_made_to_order(system["engine"]) == 1
    assert ipn(system).status_code == 200
    with Session(system["engine"]) as db:
        row=db.get(AppProduct,12)
        assert (row.reserved,row.sold) == (0,1)
        assert db.scalar(select(AppOrder)).payment_state == "completed"
