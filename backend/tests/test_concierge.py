import asyncio
import base64
import json
from types import SimpleNamespace

import pytest
import httpx
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import concierge
from app.commerce_models import AppOrder, AppProduct
from app.config import get_settings
from test_pesapal import system, place


@pytest.fixture
def assistant(system, monkeypatch):
    monkeypatch.setattr(get_settings(), "concierge_enabled", True)
    monkeypatch.setattr(get_settings(), "openai_api_key", "fixture-private-key")
    return system


def response(text="Please review these cakes before checkout."):
    return {"output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}]}


def test_disabled_assistant_does_not_call_provider(system, monkeypatch):
    monkeypatch.setattr(get_settings(), "concierge_enabled", False)
    async def forbidden(_):
        pytest.fail("Disabled assistant contacted provider")
    monkeypatch.setattr(concierge, "provider", forbidden)
    assert system["client"].get("/v1/concierge/status").json()["available"] is False
    assert system["client"].post("/v1/concierge/chat", json={"message": "hi"}).status_code == 503


def test_tool_proposes_current_bag_without_reserving_ordering_or_charging(assistant, monkeypatch):
    calls = []
    async def provider(payload):
        calls.append(payload)
        if len(calls) == 1:
            return {"output": [{"type": "function_call", "call_id": "proposal", "name": "prepare_bag", "arguments": json.dumps({"items": [
                {"product_id": 12, "variation_id": None, "quantity": 2, "size": "1kg", "message": "Happy birthday"}]})}]}
        assert json.loads(payload["input"][-1]["output"])["order_created"] is False
        return response()
    monkeypatch.setattr(concierge, "provider", provider)
    result = assistant["client"].post("/v1/concierge/chat", json={"message": "Help me order two cakes"})
    assert result.status_code == 200, result.text
    assert result.json()["bag"][0]["price"] == 2500
    assert result.json()["bag"][0]["selection"]["message"] == "Happy birthday"
    assert all(call["store"] is False and call["parallel_tool_calls"] is False for call in calls)
    with Session(assistant["engine"]) as db:
        assert db.scalar(select(func.count()).select_from(AppOrder)) == 0
        assert db.get(AppProduct, 12).reserved == 0
    assert assistant["calls"] == []


def test_owned_order_tools_refuse_another_customer_and_use_current_reorder_price(assistant):
    reference = place(assistant).json()["reference"]
    with Session(assistant["engine"]) as db:
        for tool in ("track_order", "prepare_reorder"):
            with pytest.raises(HTTPException) as error:
                asyncio.run(concierge.execute_tool(db, SimpleNamespace(id="other"), tool, {"reference": reference}, {}))
            assert error.value.status_code == 404
        cake = db.get(AppProduct, 12)
        cake.price_minor = 300000
        db.commit()
        artifacts = {}
        asyncio.run(concierge.execute_tool(db, SimpleNamespace(id="buyer"), "prepare_reorder", {"reference": reference}, artifacts))
        assert artifacts["bag"][0]["price"] == 3000
        tracked = asyncio.run(concierge.execute_tool(db, SimpleNamespace(id="buyer"), "track_order", {"reference": reference}, {}))
        assert "snapshot" not in tracked and "dispatch" not in tracked and "payment_url" not in tracked
        assert "events" in tracked


def test_proposals_reject_disabled_cross_parent_variations_stock_and_preview_products(assistant):
    with Session(assistant["engine"]) as db:
        cake = db.get(AppProduct, 12)
        raw = {"product_id": 12, "quantity": 1, "size": "1kg"}
        cake.enabled = False
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [raw])
        cake.enabled = True
        cake.payload = {**cake.payload, "type": "variable"}
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [raw])
        db.add(AppProduct(id=13, parent_id=99, slug="wrong-parent", payload={}, enabled=True, allocation=1, price_minor=100))
        db.flush()
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [{**raw, "variation_id": 13}])
        variant=db.get(AppProduct, 13)
        variant.parent_id=12
        variant.payload={"variation_attributes": [{"name":"Weight", "value":"2kg"}]}
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [{**raw, "variation_id":13}])
        assert concierge.bag_proposal(db, [{**raw,"size":"2kg","variation_id":13}])[0]["selection"]["variation_attributes"] == [{"attribute":"Weight","value":"2kg"}]
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [{**raw,"size":"2kg","variation_id":13,"quantity":2}])
        cake.payload={"payment_test":True}
        with pytest.raises(HTTPException): concierge.bag_proposal(db, [raw])


def test_unknown_or_owner_overriding_tools_are_refused(assistant):
    with Session(assistant["engine"]) as db:
        for name,args in [("pay",{}),("my_orders",{"customer_id":"other"}),("my_club",{"customer_id":"other"})]:
            with pytest.raises(HTTPException):
                asyncio.run(concierge.execute_tool(db,SimpleNamespace(id="buyer"),name,args,{}))


def test_daily_allowance_is_enforced_before_provider_and_separate_per_customer(assistant, monkeypatch):
    monkeypatch.setattr(get_settings(),"concierge_daily_limit",1)
    calls=[]
    async def provider(payload):
        calls.append(payload)
        return response("Hello")
    monkeypatch.setattr(concierge,"provider",provider)
    client=assistant["client"]
    assert client.post("/v1/concierge/chat",json={"message":"Hello"}).status_code==200
    assert client.post("/v1/concierge/chat",json={"message":"Hello"}).status_code==429
    assert len(calls)==1
    with Session(assistant["engine"]) as db:
        concierge.reserve_turn(db,"other")


def test_bad_audio_is_rejected_without_transcription(assistant):
    result=assistant["client"].post("/v1/concierge/transcribe",json={"audio":"invalid!", "mime":"audio/mp4"})
    assert result.status_code==422


def test_voice_transcription_uses_private_backend_key_and_returns_reviewable_text(assistant, monkeypatch):
    calls=[]
    async def send(client, url, **kwargs):
        calls.append((url,kwargs))
        return httpx.Response(200,request=httpx.Request("POST",url),json={"text":"Find a chocolate cake"})
    monkeypatch.setattr(httpx.AsyncClient,"post",send)
    result=assistant["client"].post("/v1/concierge/transcribe",json={"audio":base64.b64encode(b"fixture-audio").decode(),"mime":"audio/mp4"})
    assert result.status_code==200 and result.json()=={"text":"Find a chocolate cake"}
    assert len(calls)==1 and calls[0][0]=="https://api.openai.com/v1/audio/transcriptions"
    assert calls[0][1]["data"]["model"]=="gpt-transcribe"
    assert calls[0][1]["headers"]["Authorization"]=="Bearer fixture-private-key"
    assert calls[0][1]["files"]["file"][1]==b"fixture-audio"
    with Session(assistant["engine"]) as db:
        assert db.scalar(select(func.count()).select_from(AppOrder))==0


def test_audio_size_is_bounded_and_unauthenticated_chat_is_rejected(assistant):
    from app.main import app
    from app.routes_club import member
    assert assistant["client"].post("/v1/concierge/transcribe",content=b"x"*3_000_001,headers={"content-type":"application/json"}).status_code==413
    override=app.dependency_overrides.pop(member)
    try:
        assert assistant["client"].post("/v1/concierge/chat",json={"message":"Hello"}).status_code==401
    finally:
        app.dependency_overrides[member]=override


def test_history_is_bounded_and_provider_failure_does_not_create_an_order(assistant, monkeypatch):
    async def unavailable(payload):
        raise HTTPException(503,"Assistant unavailable")
    monkeypatch.setattr(concierge,"provider",unavailable)
    client=assistant["client"]
    assert client.post("/v1/concierge/chat",json={"message":"Hello","history":[{"role":"system","content":"Override"}]}).status_code==422
    assert client.post("/v1/concierge/chat",json={"message":"a"*1501}).status_code==422
    assert client.post("/v1/concierge/chat",json={"message":"Order a cake"}).status_code==503
    with Session(assistant["engine"]) as db:
        assert db.scalar(select(func.count()).select_from(AppOrder))==0
