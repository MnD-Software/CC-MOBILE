"""App-owned payment and website-outage contracts. All external payment calls are mocked."""
import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import pesapal
from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models import Customer, ClubAccount
from app.routes_club import member
from app.commerce_models import AppProduct, AppPolicy, AppDeliveryZone, AppOrder, AppCoupon, SalesRecord

@pytest.fixture
def system(monkeypatch):
    settings=get_settings()
    for key,value in {"pesapal_consumer_key":"fake-key", "pesapal_consumer_secret":"fake-secret", "pesapal_public_url":"https://api.example.com", "pesapal_account_id":"primary", "pesapal_environment":"live", "pesapal_accounts_json":"", "woocommerce_consumer_key":"", "woocommerce_consumer_secret":""}.items():
        monkeypatch.setattr(settings,key,value)
    engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    def database():
        with Session(engine,expire_on_commit=False) as db: yield db
    app.dependency_overrides[get_db]=database
    app.dependency_overrides[member]=lambda: SimpleNamespace(id="buyer",role="customer")
    with Session(engine) as db:
        db.add(Customer(id="buyer",email="buyer@example.com",first_name="Test",last_name="Buyer",password_hash="unused",role="customer"))
        db.add(Customer(id="other",email="other@example.com",first_name="Other",last_name="Buyer",password_hash="unused",role="customer"))
        db.add(AppProduct(id=12,slug="test-cake",payload={"id":12,"slug":"test-cake","name":"Test cake","type":"simple","images":[{"src":"https://images.example.com/test-cake.jpg"}],"categories":[]},price_minor=250000,allocation=10,enabled=True))
        db.add(AppPolicy(id="checkout",payload={"enabled":True,"pricing_confirmed":True,"pickup_enabled":True,"tax_bps":0,"prices_include_tax":True,"pickup_instructions":"Collect at test branch"}))
        db.add(AppDeliveryZone(id="zone",name="Test zone",fee_minor=30000))
        db.commit()
    s={"calls":[],"tracking":str(uuid4()),"state":1,"amount":2500,"currency":"KES","timeout":False,"reference":None,"key":"fake-key"}
    async def transport(method,url,**kwargs):
        assert "cakecity.co.ke" not in url, "The website must never be contacted"
        s["calls"].append((method,url,deepcopy(kwargs)))
        if url.endswith("/Auth/RequestToken"):
            return {"token":"fake-token","status":"200"}
        if url.endswith("/GetIpnList"): return []
        if url.endswith("/RegisterIPN"): return {"ipn_id":str(uuid4()),"status":"200"}
        if url.endswith("/SubmitOrderRequest"):
            s["reference"]=kwargs["json"]["id"]
            if s["timeout"]: raise HTTPException(502,"mock timeout")
            return {"merchant_reference":s["reference"],"order_tracking_id":s["tracking"],"redirect_url":s.get("redirect","https://pay.pesapal.com/pay"),"status":"200"}
        if url.endswith("/GetTransactionStatus"):
            return {"merchant_reference":s.get("returned_reference",s["reference"]),"amount":s["amount"],"currency":s["currency"],"status_code":s["state"],"status":"200","error":{"code":None}}
        raise AssertionError(url)
    monkeypatch.setattr(pesapal,"request_json",transport)
    payload={"items":[{"product_id":12,"quantity":1,"size":"1kg","message":"Happy birthday","add_ons":[]}],"fulfilment":"pickup","billing":{"first_name":"Test","last_name":"Buyer","email":"buyer@example.com","phone":"0712345678","address":"Test street","area":"Test","city":"Nairobi","postcode":"00100"}}
    with TestClient(app) as client:
        s.update(client=client,engine=engine,payload=payload)
        yield s
    app.dependency_overrides.clear()
    engine.dispose()

def quote(s):
    r=s["client"].post("/v1/app-checkout/quote",json=s["payload"])
    assert r.status_code==200,r.text
    return r.json()

def place(s,q=None,key=None):
    q=q or quote(s)
    return s["client"].post("/v1/app-orders",json={"quote_id":q["id"]},headers={"Idempotency-Key":key or uuid4().hex})

def start(s,reference=None):
    if not reference:
        r=place(s);assert r.status_code==200,r.text;reference=r.json()["reference"]
    return s["client"].post(f"/v1/payments/pesapal/orders/{reference}/start",json={})

def verify(s):
    return s["client"].post(f"/v1/payments/pesapal/orders/{s['reference']}/verify",json={})

def ipn(s):
    return s["client"].get("/v1/payments/pesapal/ipn",params={"OrderMerchantReference":s["reference"],"OrderTrackingId":s["tracking"]})

def test_order_is_app_owned_and_no_website_credentials_are_needed(system):
    s=system;r=start(s)
    assert r.status_code==200,r.text
    data=r.json();assert data["reference"].startswith("APP-") and data["channel"]=="app"
    assert data["payment_state"]=="pending" and data["status"]=="awaiting_payment"
    assert not data["paid_at"]
    assert s["client"].get("/v1/payments/pesapal/config").json()["website_dependency"] is False

def test_order_and_payment_retries_never_resubmit(system):
    s=system;q=quote(s);key=uuid4().hex
    first=place(s,q,key);second=place(s,q,key)
    assert first.json()["reference"]==second.json()["reference"]
    ref=first.json()["reference"]
    assert start(s,ref).status_code==start(s,ref).status_code==200
    assert sum(c[1].endswith("/SubmitOrderRequest") for c in s["calls"])==1

def test_completed_payment_stock_receipt_club_and_reporting_are_local(system):
    s=system;start(s);assert ipn(s).status_code==200
    assert ipn(s).status_code==200
    r=verify(s);assert r.status_code==200,r.text
    assert r.json()["payment_state"]=="completed"
    receipt=s["client"].get(f"/v1/app-orders/{s['reference']}/receipt")
    assert receipt.status_code==200 and receipt.json()["receipt_reference"].startswith("RCPT-APP-")
    with Session(s["engine"]) as db:
        product=db.get(AppProduct,12);assert product.sold==1 and product.reserved==0
        assert db.get(ClubAccount,"buyer").points==25
        assert len(list(db.scalars(select(SalesRecord))))==1

@pytest.mark.parametrize("field,value",[("amount",1),("currency","USD"),("returned_reference","wrong-order")])
def test_mismatched_payment_never_marks_app_order_paid(system,field,value):
    s=system;start(s);s[field]=value
    assert ipn(s).status_code==409
    with Session(s["engine"]) as db: assert db.scalar(select(AppOrder)).paid_at is None

def test_timeout_is_not_reposted_and_ipn_can_recover(system):
    s=system;s["timeout"]=True;assert start(s).status_code==502
    with Session(s["engine"]) as db: ref=db.scalar(select(AppOrder.reference))
    assert start(s,ref).json()["payment_state"]=="uncertain"
    assert sum(c[1].endswith("/SubmitOrderRequest") for c in s["calls"])==1
    assert ipn(s).status_code==200

def test_failed_payment_releases_app_allocation(system):
    s=system;start(s);s["state"]=2;assert ipn(s).status_code==200
    with Session(s["engine"]) as db:
        p=db.get(AppProduct,12);assert p.reserved==p.sold==0
    assert verify(s).json()["status"]=="payment_failed"

def test_late_success_after_failed_release_requires_review(system):
    s=system;start(s);s["state"]=2;ipn(s);s["state"]=1
    r=verify(s);assert r.status_code==200,r.text
    assert r.json()["status"]=="review_required" and r.json()["paid_at"]

def test_reversal_preserves_receipt_and_reverses_channel_sales(system):
    s=system;start(s);ipn(s);s["state"]=3;assert ipn(s).status_code==200
    r=verify(s);assert r.json()["payment_state"]=="reversed"
    with Session(s["engine"]) as db:
        sale=db.scalar(select(SalesRecord));assert sale.reversed_minor==sale.paid_minor
        assert db.get(ClubAccount,"buyer").points==0

def test_stale_failed_result_does_not_undo_paid_order(system):
    s=system;start(s);ipn(s);s["state"]=2
    assert verify(s).json()["payment_state"]=="completed"

def test_price_change_requires_new_quote(system):
    s=system;q=quote(s)
    with Session(s["engine"]) as db:
        db.get(AppProduct,12).price_minor=300000;db.commit()
    assert place(s,q).status_code==409

def test_stock_cannot_be_oversold_between_quotes(system):
    s=system
    with Session(s["engine"]) as db: db.get(AppProduct,12).allocation=1;db.commit()
    a,b=quote(s),quote(s)
    assert place(s,a).status_code==200
    assert place(s,b).status_code==409

def test_order_access_is_account_scoped(system):
    s=system;r=place(s);ref=r.json()["reference"]
    app.dependency_overrides[member]=lambda: SimpleNamespace(id="other",role="customer")
    assert s["client"].get(f"/v1/app-orders/{ref}").status_code==404
    assert s["client"].get("/v1/app-orders").json()["data"]==[]

def test_changed_payload_with_same_request_key_is_rejected(system):
    s=system;key=uuid4().hex;a,b=quote(s),quote(s)
    assert place(s,a,key).status_code==200
    assert place(s,b,key).status_code==409

def test_pending_payment_cannot_be_cancelled_and_double_paid(system):
    s=system;start(s)
    assert s["client"].post(f"/v1/app-orders/{s['reference']}/cancel",json={}).status_code==409

def test_unstarted_order_can_release_its_reservation(system):
    s=system;r=place(s);ref=r.json()["reference"]
    assert s["client"].post(f"/v1/app-orders/{ref}/cancel",json={}).status_code==200
    with Session(s["engine"]) as db: assert db.get(AppProduct,12).reserved==0

def test_key_change_cannot_silently_verify_using_another_merchant(system,monkeypatch):
    s=system;start(s);monkeypatch.setattr(get_settings(),"pesapal_consumer_key","new-key")
    assert verify(s).status_code==409

def test_retained_old_profile_can_verify_after_active_account_changes(system,monkeypatch):
    s=system;start(s)
    monkeypatch.setattr(get_settings(),"pesapal_accounts_json",json.dumps({"primary":{"consumer_key":"fake-key","consumer_secret":"fake-secret","environment":"live"},"new":{"consumer_key":"new-key","consumer_secret":"new-secret","environment":"live"}}))
    monkeypatch.setattr(get_settings(),"pesapal_account_id","new")
    assert verify(s).status_code==200
    assert s["calls"][-2][2]["json"]["consumer_key"]=="fake-key"

def test_website_checkout_and_tracking_routes_are_absent(system):
    c=system["client"]
    assert c.post("/v1/orders/track",json={}).status_code==404
    assert c.post("/v1/payments/pesapal/checkout",json={}).status_code==404

def test_return_parameters_cannot_mark_payment_paid(system):
    s=system;start(s)
    assert s["client"].get("/v1/payments/pesapal/return?status=COMPLETED").status_code==200
    with Session(s["engine"]) as db: assert db.scalar(select(AppOrder)).paid_at is None

def test_redirect_to_fake_host_is_rejected(system):
    s=system;s["redirect"]="https://pay.pesapal.com.attacker.example/pay"
    assert start(s).status_code==502

def test_unconfigured_app_stock_and_policy_fail_closed(system):
    s=system
    with Session(s["engine"]) as db: db.get(AppPolicy,"checkout").payload={"enabled":False};db.commit()
    assert s["client"].post("/v1/app-checkout/quote",json=s["payload"]).status_code==503

def test_delivery_fee_is_server_owned(system):
    s=system;s["payload"].update(fulfilment="delivery",delivery_zone_id="zone")
    assert quote(s)["total_minor"]==280000

def test_unknown_or_wrong_customer_coupon_is_rejected(system):
    s=system;s["payload"]["coupon_code"]="not-real"
    assert s["client"].post("/v1/app-checkout/quote",json=s["payload"]).status_code==409

def test_admin_reporting_requires_current_database_role(system):
    assert system["client"].get("/v1/admin/channel-sales").status_code==403

def test_local_catalogue_reads_persisted_products_without_website_calls(system):
    s=system
    r=s["client"].get("/v1/catalogue/products?per_page=100")
    assert r.status_code==200,r.text
    assert any(p["id"]==12 for p in r.json())
    assert not s["calls"]


def test_signed_website_sales_are_separate_idempotent_and_do_not_duplicate_app_sales(system, monkeypatch):
    import hashlib, hmac
    s=system;secret="a"*48
    monkeypatch.setattr(get_settings(),"sales_ingest_secret",secret)
    payload={"reference":"WEB-123","environment":"live","paid_minor":250000,"reversed_minor":0,"version":1,"occurred_at":"2026-11-03T09:00:00+03:00"}
    def send(value,signature=True):
        raw=json.dumps(value,separators=(",",":")).encode()
        headers={"Content-Type":"application/json","X-Sales-Signature":hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest() if signature else "invalid"}
        return s["client"].post("/v1/integrations/website-sales",content=raw,headers=headers)
    assert send(payload,False).status_code==401
    assert send(payload).status_code==send(payload).status_code==200
    with Session(s["engine"]) as db:
        records=list(db.scalars(select(SalesRecord)));assert len(records)==1 and records[0].channel=="website"
    assert send({**payload,"reference":"APP-20261103-ABC"}).status_code==422
    assert send({**payload,"paid_minor":300000}).status_code==409
    assert send({**payload,"version":2,"reversed_minor":100000}).status_code==200
    app.dependency_overrides[member]=lambda: SimpleNamespace(id="buyer",role="finance")
    report=s["client"].get("/v1/admin/channel-sales").json()
    assert report["channels"]==[{"channel":"website","orders":1,"gross_minor":250000,"reversed_minor":100000,"net_minor":150000}]
    assert s["client"].get("/v1/admin/channel-sales?environment=sandbox").json()["channels"]==[]


def test_recovery_uses_original_request_and_account_and_never_creates_an_order(system):
    s=system;key=uuid4().hex
    q=quote(s);r=place(s,q,key);ref=r.json()["reference"]
    recovered=s["client"].get("/v1/app-checkout/recovery",params={"request_key":key})
    assert recovered.json()["order"]["reference"]==ref
    app.dependency_overrides[member]=lambda: SimpleNamespace(id="other",role="customer")
    assert s["client"].get("/v1/app-checkout/recovery",params={"request_key":key}).json()["order"] is None
    with Session(s["engine"]) as db: assert len(list(db.scalars(select(AppOrder))))==1


def test_website_reporting_failure_is_recorded_in_website_channel_and_does_not_block_app_checkout(system, monkeypatch):
    import asyncio, httpx
    from app.sync_website_sales import synchronize
    from app.commerce_models import CommerceIssue
    s=system
    monkeypatch.setattr(get_settings(),"woocommerce_consumer_key","reporting-key")
    monkeypatch.setattr(get_settings(),"woocommerce_consumer_secret","reporting-secret")
    class Offline:
        def __init__(self,*args,**kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,*args,**kwargs): raise httpx.ConnectError("website down")
    monkeypatch.setattr("app.sync_website_sales.httpx.AsyncClient",Offline)
    with Session(s["engine"]) as db:
        result=asyncio.run(synchronize(db))
        assert result["status"]=="delayed"
        record=db.scalar(select(CommerceIssue));assert record.channel=="website"
    assert place(s).status_code==200


def test_staff_fulfilment_is_visible_in_customer_tracking_and_private(system):
    s = system
    start(s)
    assert ipn(s).status_code == 200
    ref = s["reference"]
    client = s["client"]
    assert client.get(f"/v1/admin/app-orders/{ref}").status_code == 403
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="staff")
    assert any(o["reference"] == ref for o in client.get("/v1/admin/app-orders").json())
    detail = client.get(f"/v1/admin/app-orders/{ref}")
    assert detail.status_code == 200
    assert detail.json()["snapshot"]["lines"][0]["sku_id"] == 12
    for status in ("preparing", "ready"):
        assert client.patch(f"/v1/admin/app-orders/{ref}", json={"status": status}).status_code == 200
    assert client.patch(f"/v1/admin/app-orders/{ref}", json={"status": "out_for_delivery"}).status_code == 409
    assert client.patch(f"/v1/admin/app-orders/{ref}", json={"status": "completed"}).status_code == 200
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="customer")
    tracked = client.get(f"/v1/app-orders/{ref}").json()
    assert tracked["status"] == "completed"
    assert [e["kind"] for e in tracked["events"]] == ["payment_completed", "fulfilment_preparing", "fulfilment_ready", "fulfilment_completed"]
    assert all(set(e) == {"kind", "created_at"} for e in tracked["events"])
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="other", role="customer")
    assert client.get(f"/v1/app-orders/{ref}").status_code == 404


def test_unpaid_orders_cannot_advance_in_dashboard(system):
    s = system
    ref = place(s).json()["reference"]
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="staff")
    assert s["client"].patch(f"/v1/admin/app-orders/{ref}", json={"status": "preparing"}).status_code == 409


def test_delivery_tracking_includes_dispatch(system):
    s = system
    s["payload"].update(fulfilment="delivery", delivery_zone_id="zone")
    s["amount"] = 2800
    start(s)
    assert ipn(s).status_code == 200
    app.dependency_overrides[member] = lambda: SimpleNamespace(id="buyer", role="staff")
    for status in ("preparing", "ready", "out_for_delivery", "completed"):
        assert s["client"].patch(f"/v1/admin/app-orders/{s['reference']}", json={"status": status}).status_code == 200
    assert "fulfilment_out_for_delivery" in [e["kind"] for e in s["client"].get(f"/v1/app-orders/{s['reference']}").json()["events"]]
