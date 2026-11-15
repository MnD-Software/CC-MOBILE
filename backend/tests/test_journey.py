from datetime import UTC, datetime, timedelta
from uuid import uuid4
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from test_pesapal import system, start, verify, quote, place
from test_logistics import actor, delivery, assign, ready, trip, progress
from test_experience import window
from app.journey import DesignProof, JourneySignal, TripVerification
from app.experience import SlotWaitlist
from app.notification_models import AccountNotification
from app.models import Customer, OrganizationMember
from app.models import ClubAccount, ClubEntry
from app.commerce_models import AppOrder, AppProduct

def test_member_can_choose_small_point_amount_and_retry_without_double_spend(system):
    s=system;c=s['client'];actor('buyer','customer')
    with Session(s['engine']) as db:
        db.add(ClubAccount(customer_id='buyer',points=50))
        db.add(ClubEntry(id=uuid4().hex,customer_id='buyer',event_key=uuid4().hex,points=50,remaining=50,description='Local test points'))
        db.commit()
    payload={'points':17,'request_key':uuid4().hex}
    first=c.post('/v1/club/redeem',json=payload);assert first.status_code==200,first.text
    assert c.post('/v1/club/redeem',json=payload).json()==first.json()
    assert c.get('/v1/club').json()['points']==33
    assert c.post('/v1/club/redeem',json={**payload,'points':18}).status_code==409
    assert c.post('/v1/club/redeem',json={'points':34,'request_key':uuid4().hex}).status_code==409
    assert c.post('/v1/club/redeem',json={'points':0,'request_key':uuid4().hex}).status_code==422


def test_full_slot_waitlist_notifies_once_without_booking_and_is_private(system):
    s=system;c=s['client'];slot,data=window(c)
    actor('buyer','customer');s['payload']['delivery_slot_id']=slot['id']
    order=place(s);assert order.status_code==200,order.text
    actor('other','customer')
    path=f"/v1/experience/slots/{slot['id']}/waitlist"
    assert c.put(path,json={'enabled':True}).status_code==200
    assert c.put(path,json={'enabled':True}).status_code==200
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['waitlist_status']=='waiting'
    actor('buyer','customer')
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['waitlist_status'] is None
    assert c.post(f"/v1/app-orders/{order.json()['reference']}/cancel",json={}).status_code==200
    actor('other','customer')
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['waitlist_status']=='notified'
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['remaining']==1
    with Session(s['engine']) as db:
        assert db.scalar(select(func.count()).select_from(AccountNotification).where(AccountNotification.customer_id=='other',AccountNotification.kind=='slot_available'))==1
        assert db.scalar(select(func.count()).select_from(AppOrder))==1


def test_design_approval_is_versioned_owned_and_blocks_kitchen(delivery):
    s=delivery;c=s['client'];assign(s);ref=s['reference']
    root=f'/v1/journey/staff/orders/{ref}/design'
    actor();r=c.put(root,json={'revision':0,'description':'White icing with a blue border and Happy Birthday inscription.'});assert r.status_code==200,r.text
    actor('other','customer');assert c.get(f'/v1/journey/orders/{ref}/design').status_code==404
    actor('chef','production');assert c.patch(f'/v1/kitchen/orders/{ref}/status',json={'status':'preparing'}).status_code==409
    actor('buyer','customer')
    own=f'/v1/journey/orders/{ref}/design'
    assert c.post(own,json={'revision':1,'decision':'changes_requested','note':'Please change the border to pink.'}).status_code==200
    actor();r=c.put(root,json={'revision':1,'description':'White icing with a pink border and the approved birthday inscription.'});assert r.status_code==200,r.text
    assert c.put(root,json={'revision':1,'description':'A stale design revision'}).status_code==409
    actor('buyer','customer')
    assert c.post(own,json={'revision':1,'decision':'approved'}).status_code==409
    assert c.post(own,json={'revision':2,'decision':'approved'}).status_code==200
    assert c.post(own,json={'revision':2,'decision':'approved'}).status_code==200
    ready(s)
    actor();assert c.put(root,json={'revision':2,'description':'A replacement after production started'}).status_code==409


def test_product_facts_require_verified_source_and_do_not_infer_safety(system):
    s=system;c=s['client'];root='/v1/journey/staff/products/12/facts'
    assert c.get('/v1/journey/products/12/facts').json() is None
    actor('buyer','customer');assert c.put(root,json={}).status_code==403
    actor();assert c.put(root,json={'published':True}).status_code==422
    payload={'revision':0,'published':True,'ingredients':'Flour, eggs, milk, sugar','contains':['Egg','Milk','Wheat'],'may_contain':['Nuts'],'dietary':[],'handling':'Keep refrigerated; follow the label.','source':'Approved kitchen recipe reference 12'}
    r=c.put(root,json=payload);assert r.status_code==200,r.text
    public=c.get('/v1/journey/products/12/facts').json()
    assert public['contains']==['Egg','Milk','Wheat'] and 'source' not in public
    assert c.put(root,json=payload).status_code==409


def test_measurement_is_opt_in_idempotent_bounded_and_revoke_deletes(system):
    s=system;c=s['client'];actor('buyer','customer')
    payload={'events':[{'event_id':uuid4().hex,'name':'checkout_started'}]}
    assert c.post('/v1/journey/signals',json=payload).status_code==403
    assert c.put('/v1/journey/consent',json={'enabled':True}).status_code==200
    for _ in range(2):assert c.post('/v1/journey/signals',json=payload).status_code==200
    assert c.post('/v1/journey/signals',json={'events':[{'event_id':uuid4().hex,'name':'search_started','email':'private@example.com'}]}).status_code==422
    actor();live=c.get('/v1/journey/staff/funnel').json();assert live['items']==[]
    data=c.get('/v1/journey/staff/funnel?environment=development').json();assert data['items']==[{'name':'checkout_started','events':1,'customers':1}]
    actor('other','customer');assert c.get('/v1/journey/consent').json()=={'enabled':False}
    actor('buyer','customer');assert c.put('/v1/journey/consent',json={'enabled':False}).status_code==200
    with Session(s['engine']) as db:assert db.scalar(select(func.count()).select_from(JourneySignal))==0


def test_trip_qr_is_role_scoped_revision_bound_and_delivery_still_needs_ack(delivery):
    s=delivery;c=s['client'];assign(s);task=trip(s);ready(s);task=progress(s,task,'accepted')
    path=f"/v1/journey/staff/tasks/{task['id']}/handover-code"
    actor('rider','rider');assert c.post(path,json={}).status_code==403
    actor();r=c.post(path,json={});assert r.status_code==200,r.text
    code=r.json();assert code['qr_data'].startswith('data:image/svg+xml;base64,')
    actor('rider','rider')
    assert c.patch(f"/v1/rider/tasks/{task['id']}",json={'revision':task['revision'],'status':'collected'}).status_code==422
    task=progress(s,task,'collected',verification_code=code['code'])
    task=progress(s,task,'in_transit')
    root=f"/v1/journey/orders/{s['reference']}/delivery-codes"
    actor('other','customer');assert c.get(root).status_code==404
    actor('buyer','customer');code=c.get(root).json()[0]
    task=progress(s,task,'delivered',proof='Received by the customer',verification_code=code['code'])
    actor('buyer','customer')
    detail=c.get('/v1/app-orders/'+s['reference']).json()
    assert detail['received_at'] is None
    assert c.post('/v1/app-orders/'+s['reference']+'/received').status_code==200


def test_approver_limit_is_enforced_on_server(system):
    s=system;c=s['client'];actor()
    org=c.post('/v1/business/companies',json={'request_key':uuid4().hex,'name':'Acme Team','billing_address':'Nairobi Office','industry':'Services','email':'client@acme.example','first_name':'Corporate','last_name':'Buyer','password':'Local-test-password-123'})
    assert org.status_code==201,org.text
    identity=org.json()['id'];root='/v1/business/companies/'+identity
    with Session(s['engine']) as db:
        p=db.get(AppProduct,12);p.payload={**p.payload,'name':'Celebration Cake 2kg','size':'2kg'}
        db.add(Customer(id='approver',email='approver@example.com',first_name='Limited',last_name='Approver',role='corporate_client',password_hash='unused'))
        db.add(OrganizationMember(organization_id=identity,customer_id='approver',role='approver'));db.commit()
    r=c.put(root+'/purchasing',json={'revision':0,'customer_id':'approver','role':'approver','approval_limit_minor':10000});assert r.status_code==200,r.text
    from app.commerce_models import AppPolicy
    with Session(s['engine']) as db:
        policy = db.get(AppPolicy, 'cp:' + identity)
        assert policy is not None and len(policy.id) <= 40
    quote=c.post(root+'/documents',json={'request_key':uuid4().hex,'kind':'quote','lines':[{'product_id':12,'quantity':1}]}).json()
    actor('approver','corporate_client')
    assert c.post(root+'/documents/'+quote['id']+'/status',json={'revision':1,'status':'accepted'}).status_code==403
    assert c.put(root+'/purchasing',json={'revision':1,'customer_id':'approver','role':'approver'}).status_code==403


def test_retention_removes_old_signals_and_expired_trip_codes(delivery):
    from app.journey import purge_measurements
    s = delivery
    assign(s)
    task = trip(s)
    now = datetime.now(UTC)
    with Session(s['engine']) as db:
        for name, days in [('expired', 31), ('current', 2)]:
            db.add(JourneySignal(id=name, customer_id='buyer', event_id=name,
                name='checkout_started', environment='development',
                created_at=now-timedelta(days=days)))
        db.add(TripVerification(task_id=task['id'], purpose='handover', revision=1,
            expires_at=now-timedelta(hours=2), payload={}))
        db.add(TripVerification(task_id=task['id'], purpose='delivery', revision=1,
            expires_at=now+timedelta(minutes=20), payload={}))
        db.commit()
        purge_measurements(db)
        assert db.get(JourneySignal, 'expired') is None
        assert db.get(JourneySignal, 'current') is not None
        assert db.get(TripVerification, (task['id'], 'handover')) is None
        assert db.get(TripVerification, (task['id'], 'delivery')) is not None
