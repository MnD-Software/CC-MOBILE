from sqlalchemy import select
from sqlalchemy.orm import Session
from test_pesapal import system
from test_logistics import delivery, actor, assign, ready, trip, progress
from app.commerce_models import AppOrderEvent
from app.logistics_models import LogisticsTask


def test_trip_feedback_requires_owner_receipt_and_remains_idempotent(delivery):
    s=delivery
    assign(s)
    task=trip(s)
    path=f"/v1/app-orders/{s['reference']}/deliveries/{task['id']}/feedback"
    payload=dict(rating=4,timing="late",condition="good",comment=" Careful rider ")
    actor("buyer","customer")
    assert s["client"].post(path,json=payload).status_code==409
    ready(s)
    for state in ("accepted","collected","in_transit","delivered"):
        task=progress(s,task,state,**({"proof":"Received by buyer"} if state=="delivered" else {}))
    actor("buyer","customer")
    assert s["client"].post(path,json=payload).status_code==409
    assert s["client"].post(f"/v1/app-orders/{s['reference']}/received").status_code==200
    actor("other","customer")
    assert s["client"].post(path,json=payload).status_code==404
    actor("buyer","customer")
    assert s["client"].post(path,json={**payload,"timing":"invented"}).status_code==422
    assert s["client"].post(path,json={**payload,"rating":6}).status_code==422
    for _ in range(2):
        result=s["client"].post(path,json=payload)
        assert result.status_code==200,result.text
        assert result.json()["comment"]=="Careful rider"
    assert s["client"].post(path,json={**payload,"rating":1}).status_code==409
    detail=s["client"].get(f"/v1/app-orders/{s['reference']}").json()
    assert detail["deliveries"][0]["feedback"]["rating"]==4
    actor()
    tasks=s["client"].get("/v1/logistics/tasks").json()
    assert tasks[0]["feedback"]["timing"]=="late" and tasks[0]["feedback"]["condition"]=="good"
    with Session(s["engine"]) as db:
        assert len(list(db.scalars(select(AppOrderEvent).where(AppOrderEvent.kind=="delivery_feedback"))))==1
        original=db.get(LogisticsTask,task["id"])
        db.add(LogisticsTask(id="second-delivery",order_id=original.order_id,plant=original.plant,
            service_type="delivery",rider_id=original.rider_id,resource_type="internal_rider",status="delivered",
            destination=original.destination,recipient=original.recipient,phone=original.phone,items=original.items))
        db.commit()
    actor("buyer","customer")
    second=f"/v1/app-orders/{s['reference']}/deliveries/second-delivery/feedback"
    assert s["client"].post(second,json={**payload,"rating":5,"timing":"on_time"}).status_code==200
    with Session(s["engine"]) as db:
        assert len(list(db.scalars(select(AppOrderEvent).where(AppOrderEvent.kind=="delivery_feedback"))))==2
