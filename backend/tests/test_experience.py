from datetime import UTC,datetime,timedelta
from uuid import uuid4
from sqlalchemy import select,func
from sqlalchemy.orm import Session
from test_pesapal import system,quote,place,start,verify
from test_logistics import actor,delivery,assign,ready,trip,progress
from app.models import Customer
from app.commerce_models import AppOrder,AppProduct,AppCoupon,SalesRecord
from app.experience import FulfilmentSlot,SlotReservation,CareCase

def window(client,**extra):
    actor()
    now=datetime.now(UTC)
    data=dict(label='Tomorrow afternoon',fulfilment=extra.pop('fulfilment','pickup'),cutoff_at=(now+timedelta(hours=2)).isoformat(),starts_at=(now+timedelta(hours=3)).isoformat(),ends_at=(now+timedelta(hours=4)).isoformat(),capacity=1,enabled=True,revision=0,**extra)
    response=client.put('/v1/experience/staff/slots/'+str(uuid4()),json=data)
    assert response.status_code==200,response.text
    return response.json(),data

def test_preferences_are_account_scoped_and_control_discovery(system):
    s=system;c=s['client'];actor('buyer','customer')
    with Session(s['engine']) as db:
        p=db.get(AppProduct,12);p.payload={**p.payload,'name':'Chocolate Cake'};db.commit()
    assert c.put('/v1/experience/preferences',json={'flavours':['chocolate'],'budget_minor':300000,'personalised':True}).status_code==200
    result=c.get('/v1/experience/home');assert result.status_code==200,result.text
    assert [p['id'] for p in result.json()['products']]==[12]
    assert c.put('/v1/experience/preferences',json={'flavours':['vanilla']}).status_code==200
    assert c.get('/v1/experience/home').json()['products']==[]
    actor('other','customer')
    assert c.get('/v1/experience/preferences').json()['flavours']==[]
    assert c.get('/v1/experience/home').json()['usual']==[]
    assert c.get('/v1/experience/staff/promotion-results').status_code==403
    assert c.get('/v1/experience/staff/exceptions').status_code==403

def test_reorder_uses_current_prices_and_never_copies_message_or_places_order(system):
    s=system;c=s['client'];start(s);verify(s);ref=s['reference']
    with Session(s['engine']) as db:
        p=db.get(AppProduct,12);p.price_minor=320000;p.revision+=1;db.commit()
    actor('buyer','customer')
    r=c.post(f'/v1/experience/orders/{ref}/reorder',json={})
    assert r.status_code==200,r.text
    line=r.json()['lines'][0]
    assert line['price']==3200 and line['selection']['message']==''
    assert line['selection'].get('variation_id','missing')=='missing'
    with Session(s['engine']) as db: assert db.scalar(select(func.count()).select_from(AppOrder))==1
    actor('other','customer');assert c.post(f'/v1/experience/orders/{ref}/reorder',json={}).status_code==404
    actor('buyer','customer')
    with Session(s['engine']) as db:
        p=db.get(AppProduct,12);p.enabled=False;db.commit()
    assert c.post(f'/v1/experience/orders/{ref}/reorder',json={}).status_code==409

def test_slot_last_place_is_atomic_and_cancellation_releases_once(system):
    s=system;c=s['client'];slot,data=window(c)
    actor('buyer','customer');s['payload']['delivery_slot_id']=slot['id']
    first=quote(s);second=quote(s)
    one=place(s,first);assert one.status_code==200,one.text
    assert place(s,second).status_code==409
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['full'] is True
    ref=one.json()['reference']
    assert c.post('/v1/app-orders/'+ref+'/cancel',json={}).status_code==200
    assert c.post('/v1/app-orders/'+ref+'/cancel',json={}).status_code==409
    assert c.get('/v1/experience/slots?fulfilment=pickup').json()[0]['remaining']==1
    with Session(s['engine']) as db:
        assert db.get(FulfilmentSlot,slot['id']).occupied==0
        assert db.get(AppProduct,12).reserved==0

def test_booked_slot_cannot_be_moved_or_reduced_below_bookings(system):
    s=system;c=s['client'];slot,data=window(c)
    actor('buyer','customer');s['payload']['delivery_slot_id']=slot['id'];assert place(s).status_code==200
    actor()
    moved={**data,'revision':1,'starts_at':(datetime.now(UTC)+timedelta(hours=3,minutes=15)).isoformat()}
    assert c.put('/v1/experience/staff/slots/'+slot['id'],json=moved).status_code==409
    assert c.put('/v1/experience/staff/slots/'+slot['id'],json={**data,'revision':1,'capacity':2}).status_code==403
    actor('buyer','dispatch')
    assert c.post('/v1/experience/staff/slots/'+slot['id']+'/override',json={'revision':1,'extra_places':1,'reason':'Extra rider and kitchen capacity confirmed.'}).status_code==200
    assert c.post('/v1/experience/staff/slots/'+slot['id']+'/override',json={'revision':1,'extra_places':1,'reason':'Extra rider and kitchen capacity confirmed.'}).status_code==409
    actor('buyer','customer');assert c.get('/v1/experience/staff/slots').status_code==403

def test_slot_quote_rejects_wrong_fulfilment_expiry_and_staff_revision(system):
    s=system;c=s['client'];slot,data=window(c)
    actor('buyer','customer');s['payload'].update(fulfilment='delivery',delivery_zone_id='zone',delivery_slot_id=slot['id'])
    assert c.post('/v1/app-checkout/quote',json=s['payload']).status_code==409
    s['payload']['fulfilment']='pickup';saved=quote(s)
    actor();assert c.put('/v1/experience/staff/slots/'+slot['id'],json={**data,'revision':1,'enabled':False}).status_code==200
    actor('buyer','customer');assert place(s,saved).status_code==409

def test_bad_delivery_creates_one_owned_care_case_with_visible_updates(delivery):
    s=delivery;c=s['client'];assign(s);task=trip(s);ready(s)
    with Session(s['engine']) as db:
        db.add(Customer(id='agent',role='call_center_agent',email='care@example.com',first_name='Care',last_name='Agent',password_hash='fixture'));db.commit()
    for state in ('accepted','collected','in_transit','delivered'):
        task=progress(s,task,state,**({'proof':'Received'} if state=='delivered' else {}))
    actor('buyer','customer');assert c.post(f"/v1/app-orders/{s['reference']}/received").status_code==200
    path=f"/v1/app-orders/{s['reference']}/deliveries/{task['id']}/feedback"
    feedback=dict(rating=1,timing='late',condition='damaged',comment='Please help')
    assert c.post(path,json=feedback).status_code==200
    assert c.post(path,json=feedback).status_code==200
    own=c.get('/v1/experience/care').json();assert len(own)==1 and 'agent_id' not in own[0]
    actor('other','customer');assert c.get('/v1/experience/care').json()==[]
    actor('rider','rider');assert c.get('/v1/experience/staff/care').status_code==403
    actor('agent','call_center_agent');case=c.get('/v1/experience/staff/care').json()[0]
    assert case['agent_id']=='agent'
    payload={'revision':case['revision'],'state':'contacted','reply':'We are arranging a resolution.'}
    assert c.put('/v1/experience/staff/care/'+case['id'],json=payload).status_code==200
    assert c.put('/v1/experience/staff/care/'+case['id'],json=payload).status_code==409
    actor('buyer','customer');assert c.get('/v1/experience/care').json()[0]['reply']==payload['reply']

def test_gift_note_is_private_escaped_and_price_free(system):
    s=system;c=s['client'];s['payload'].update(recipient_name='Recipient',recipient_phone='0712345678',gift_message='<script>surprise</script>',hide_gift_prices=True)
    row=place(s);assert row.status_code==200,row.text;ref=row.json()['reference']
    note=c.get(f'/v1/experience/orders/{ref}/gift-note')
    assert note.status_code==200 and 'data:image/png;base64,' in note.text
    assert '&lt;script&gt;' in note.text and '<script>' not in note.text and 'KES' not in note.text and '2500' not in note.text
    actor('other','customer');assert c.get(f'/v1/experience/orders/{ref}/gift-note').status_code==404

def test_hq_is_not_a_pickup_choice_but_delivery_origin_is_retained(system):
    s=system;c=s['client'];s['payload']['pickup_location_id']='hq'
    assert c.post('/v1/app-checkout/quote',json=s['payload']).status_code==422
    data=c.get('/v1/app-checkout/options').json()
    assert all(p['id']!='hq' for p in data['distance_delivery']['pickup_stores'])
    assert data['distance_delivery']['origin_name']

def test_company_favourites_and_repeat_preserve_approval_and_current_prices(system):
    from app.models import Organization,OrganizationMember
    s=system;c=s['client']
    with Session(s['engine']) as db:
        db.add(Organization(id='company',owner_id='buyer',request_key='company-request',name='Team',billing_address='Office'))
        db.add(OrganizationMember(organization_id='company',customer_id='buyer',role='buyer'))
        db.commit()
    actor('buyer','corporate_client')
    root='/v1/business/companies/company'
    created=c.post(root+'/documents',json={'kind':'quote','request_key':'initial-quote-request','lines':[{'product_id':12,'quantity':1}]})
    assert created.status_code==201,created.text
    original=created.json()
    favourite='/v1/experience/companies/company/favourites/'+original['id']
    assert c.put(favourite,json={'enabled':True}).status_code==200
    assert c.put(favourite,json={'enabled':True}).status_code==200
    assert len(c.get('/v1/experience/companies/company/favourites').json())==1
    with Session(s['engine']) as db:
        product=db.get(AppProduct,12);product.price_minor=350000;db.commit()
    repeated=c.post(root+'/documents/'+original['id']+'/repeat',json={'request_key':'repeat-quote-request'})
    assert repeated.status_code==201,repeated.text
    assert repeated.json()['status']=='requested' and repeated.json()['total_minor']==350000
    assert c.post(root+'/documents/'+original['id']+'/repeat',json={'request_key':'repeat-quote-request'}).json()['id']==repeated.json()['id']
    actor('other','customer')
    assert c.get('/v1/experience/companies/company/favourites').status_code==404
    assert c.put(favourite,json={'enabled':False}).status_code==404

def test_promotion_results_separate_verified_collections_from_review_and_reversals(system):
    s=system;c=s['client']
    with Session(s['engine']) as db:
        db.add(AppCoupon(code='result100',amount_minor=10000,minimum_minor=0,usage_limit=10,enabled=True));db.commit()
    s['payload']['coupon_code']='result100';s['amount']=2400;start(s);verify(s)
    actor('buyer','marketing_manager')
    result=c.get('/v1/experience/staff/promotion-results')
    assert result.status_code==200,result.text
    row=result.json()['items'][0]
    assert row['orders']==1 and row['first_buyers']==1 and row['net_collected_minor']==240000
    with Session(s['engine']) as db:
        sale=db.scalar(select(SalesRecord));sale.reversed_minor=40000;db.commit()
    assert c.get('/v1/experience/staff/promotion-results').json()['items'][0]['net_collected_minor']==200000
    actor('rider','rider');assert c.get('/v1/experience/staff/promotion-results').status_code==403

def test_exception_scope_never_exposes_another_agents_orders(delivery):
    s=delivery;c=s['client']
    with Session(s['engine']) as db:
        order=db.scalar(select(AppOrder));order.paid_at=datetime.now(UTC)-timedelta(hours=1);db.commit()
    actor()
    assert c.get('/v1/experience/staff/exceptions').json()['items'][0]['kind']=='unassigned_kitchen'
    actor('unassigned-agent','call_center_agent')
    assert c.get('/v1/experience/staff/exceptions').json()['items']==[]
    actor('buyer','customer');assert c.get('/v1/experience/staff/exceptions').status_code==403

def test_only_dispatch_manager_can_override_pickup_and_delivery_windows(system):
    from app.models import AdministrativeEvent
    s=system;c=s['client']
    for fulfilment in ['pickup','delivery']:
        slot,data=window(c,fulfilment=fulfilment)
        with Session(s['engine']) as db:
            row=db.get(FulfilmentSlot,slot['id']);row.occupied=1;db.commit()
        payload={'revision':1,'extra_places':1,'reason':'Extra kitchen and rider capacity confirmed.'}
        path='/v1/experience/staff/slots/'+slot['id']+'/override'
        for role in ['admin','staff','ecommerce_manager','production','branch_manager','branch_dispatch','rider','customer','call_center_manager']:
            actor('buyer',role);assert c.post(path,json=payload).status_code==403,role
        actor('buyer','dispatch')
        assert c.post(path,json={**payload,'reason':'short'}).status_code==422
        r=c.post(path,json=payload);assert r.status_code==200,r.text
        assert r.json()['remaining']==1 and not r.json()['full']
        assert c.post(path,json=payload).status_code==409
        with Session(s['engine']) as db:
            event=db.scalar(select(AdministrativeEvent).where(AdministrativeEvent.resource_id==slot['id'],AdministrativeEvent.action=='fulfilment.slot_override'))
            assert event.details['reason']==payload['reason'] and event.details['fulfilment']==fulfilment

def test_no_preferred_window_cannot_bypass_configured_capacity(system):
    s=system;c=s['client'];slot,data=window(c)
    actor('buyer','customer')
    response=c.post('/v1/app-checkout/quote',json=s['payload'])
    assert response.status_code==409 and 'Choose an available time slot' in response.text
