from datetime import UTC,datetime,timedelta
from sqlalchemy.orm import Session
from app.models import Customer
from app.commerce_models import AppProduct
from test_pesapal import system
from test_logistics import actor,delivery,assign


def offer(**changes):
    return {'amount_minor':10000,'minimum_minor':0,'usage_limit':20,'enabled':True,
            'title':'A sweeter weekend','discoverable':True,**changes}


def test_marketing_scheduled_percentage_delivery_and_caps_are_server_owned(system):
    s=system;c=s['client'];actor(role='marketing_manager')
    data=offer(discount_type='percentage',percentage_bps=2000,maximum_minor=30000,per_customer_limit=1)
    response=c.put('/v1/admin/dashboard/promotions/sweet20',json=data)
    assert response.status_code==200,response.text
    assert len(c.get('/v1/promotions').json())==1
    assert c.get('/v1/admin/dashboard/products').status_code==403
    actor(role='customer');s['payload']['coupon_code']='sweet20'
    q=c.post('/v1/app-checkout/quote',json=s['payload'])
    assert q.status_code==200,q.text
    assert q.json()['discount_minor']==30000
    actor(role='marketing_manager')
    assert c.put('/v1/admin/dashboard/promotions/later',json=offer(starts_at=(datetime.now(UTC)+timedelta(days=1)).isoformat())).status_code==200
    assert 'later' not in {p['code'] for p in c.get('/v1/promotions').json()}
    assert c.put('/v1/admin/dashboard/promotions/delivery100',json=offer(scope='delivery')).status_code==200
    actor(role='customer');s['payload'].update(coupon_code='later')
    assert c.post('/v1/app-checkout/quote',json=s['payload']).status_code==409
    s['payload'].update(coupon_code='delivery100',fulfilment='delivery',delivery_zone_id='zone')
    q=c.post('/v1/app-checkout/quote',json=s['payload'])
    assert q.status_code==200,q.text
    assert q.json()['discount_minor']==10000
    actor(role='marketing_manager')
    assert c.put('/v1/admin/dashboard/promotions/bad',json=offer(discount_type='percentage',percentage_bps=10001)).status_code==422


def test_photo_hold_and_whole_cake_rules_preserve_staff_inventory(system):
    s=system;c=s['client']
    with Session(s['engine']) as db:
        base=db.get(AppProduct,12)
        base.payload={**base.payload,'name':'Milky Caramel Cake 2kg'}
        for identity,name,images in [(21,'Chocolate Cake Slice',[{'src':'https://images.example.com/slice.jpg'}]),(22,'Vanilla Cupcakes',[{'src':'https://images.example.com/cupcake.jpg'}]),(23,'Whole Chocolate Cake 2kg',[])]:
            db.add(AppProduct(id=identity,slug='cake-'+str(identity),payload={'id':identity,'name':name,'images':images,'type':'simple','order_mode':'made_to_order'},price_minor=100000,enabled=True))
        db.commit()
    public=c.get('/v1/catalogue/products?per_page=100').json()
    assert 23 not in {p['id'] for p in public}
    diy=c.get('/v1/diy/inventory').json()
    assert [p['id'] for p in diy]==[12]
    assert diy[0]['canvas_colour']=='#FFF8EE'
    assert c.post('/v1/diy/quote',json={'product_id':21}).status_code==409
    with Session(s['engine']) as db:
        p=db.get(AppProduct,23);p.payload={**p.payload,'images':[{'src':'https://images.example.com/whole.jpg'}]};db.commit()
    assert 23 in {p['id'] for p in c.get('/v1/catalogue/products?per_page=100').json()}
    assert 23 in {p['id'] for p in c.get('/v1/diy/inventory').json()}


def test_agent_ownership_handoff_receipts_and_no_payment_privileges(delivery):
    s=delivery;c=s['client'];ref=s['reference']
    with Session(s['engine']) as db:
        for identity in ['agent-a','agent-b']:
            db.add(Customer(id=identity,email=identity+'@example.com',role='call_center_agent',first_name=identity,last_name='Agent',password_hash='test-only-not-a-password'))
        db.commit()
    actor('agent-a','call_center_agent')
    assert c.get('/v1/service-desk/records?scope=unassigned').json()['items'][0]['identity']==ref
    assert c.get('/v1/service-desk/records/order/'+ref).status_code==403
    r=c.put('/v1/service-desk/records/order/'+ref,json={'revision':0,'note':'Customer needs delivery before noon','handoff':'dispatch','priority':'urgent'})
    assert r.status_code==200,r.text
    assert c.get('/v1/service-desk/records/order/'+ref).json()['notes'][0]['department']=='dispatch'
    receipt=c.get('/v1/service-desk/orders/'+ref+'/receipt')
    assert receipt.status_code==200 and 'data:image/png;base64,' in receipt.text
    assert c.get('/v1/service-desk/report.xlsx').content[:2]==b'PK'
    assert c.get('/v1/admin/app-orders').status_code==403
    assert c.post('/v1/logistics/bulk-work',json={'references':[ref],'action':'ready'}).status_code==403
    actor('agent-b','call_center_agent')
    assert c.get('/v1/service-desk/records?scope=all').json()['items']==[]
    assert c.get('/v1/service-desk/records/order/'+ref).status_code==403
    assert c.get('/v1/service-desk/orders/'+ref+'/receipt').status_code==403
    assert c.put('/v1/service-desk/records/order/'+ref,json={'revision':1}).status_code==403
    actor('chef','production')
    assert c.get('/v1/service-desk/records/order/'+ref).json()['priority']=='urgent'
    actor('buyer','customer')
    assert c.get('/v1/service-desk/records').status_code==403


def test_bulk_work_reports_each_order_and_keeps_blocked_orders_unmodified(delivery):
    s=delivery;assign(s);actor('chef','production')
    r=s['client'].post('/v1/logistics/bulk-work',json={'references':[s['reference'],'APP-NOT-FOUND'],'action':'preparing'})
    assert r.status_code==200,r.text
    assert r.json()['results'][0]['ok'] is True
    assert r.json()['results'][1]['ok'] is False
    assert s['client'].post('/v1/logistics/bulk-work',json={'references':[s['reference']]*2,'action':'ready'}).status_code==422


def test_corporate_weight_bands_and_quote_recall_are_client_visible(system):
    s=system;c=s['client'];actor(role='admin')
    company=c.post('/v1/business/companies',json={'request_key':'corporate-weight-test-123','name':'Weight Test','billing_address':'Nairobi','industry':'Office','email':'weight@example.com','first_name':'Client','last_name':'One','password':'Test-only-password-123'})
    assert company.status_code==201,company.text
    root='/v1/business/companies/'+company.json()['id']
    with Session(s['engine']) as db:
        buyer=db.query(Customer).filter(Customer.email=='weight@example.com').one().id
    for weight,bps in [(1,0),(2,500),(5,500),(5.1,1000)]:
        with Session(s['engine']) as db:
            product=db.get(AppProduct,12);product.payload={**product.payload,'name':f'Caramel Cake {weight}kg'};db.commit()
        q=c.post(root+'/documents',json={'request_key':'weight-quote-'+str(weight)+'-key-123','kind':'quote','lines':[{'product_id':12,'quantity':1}]})
        assert q.status_code==201,q.text
        doc=q.json();assert doc['discount_bps']==bps
        assert doc['total_minor']==250000-250000*bps//10000
    actor(buyer,'corporate_client')
    assert any(d['id']==doc['id'] for d in c.get(root).json()['documents'])
    assert c.post(root+'/documents/'+doc['id']+'/status',json={'revision':1,'status':'recalled'}).status_code==403
    actor(role='admin')
    recalled=c.post(root+'/documents/'+doc['id']+'/status',json={'revision':1,'status':'recalled'})
    assert recalled.status_code==200,recalled.text
    actor(buyer,'corporate_client')
    assert c.post(root+'/documents/'+doc['id']+'/status',json={'revision':2,'status':'accepted'}).status_code==409
    assert next(d for d in c.get(root).json()['documents'] if d['id']==doc['id'])['status']=='recalled'


def test_marketing_segments_target_coupons_and_reminders_require_consent(system):
    from app.commerce_models import AppQuote
    from app.notification_models import AccountNotification
    from app.marketing_crm import recover
    s=system;c=s['client'];actor(role='marketing_manager')
    assert c.put('/v1/admin/dashboard/promotions/repeat-only',json=offer(segment='repeat')).status_code==200
    assert 'repeat-only' not in [p['code'] for p in c.get('/v1/promotions').json()]
    actor('buyer','customer');s['payload']['coupon_code']='repeat-only'
    assert c.post('/v1/app-checkout/quote',json=s['payload']).status_code==409
    s['payload']['coupon_code']=None
    q=c.post('/v1/app-checkout/quote',json=s['payload']);assert q.status_code==200,q.text
    with Session(s['engine']) as db:
        db.get(AppQuote,q.json()['id']).expires_at=datetime.now(UTC)-timedelta(minutes=30);db.commit()
        assert recover(db)==0
    assert c.put('/v1/account/marketing-consent',json={'enabled':True}).status_code==200
    with Session(s['engine']) as db:
        assert recover(db)==1
        assert recover(db)==0
        notification=db.query(AccountNotification).filter(AccountNotification.kind=='checkout_reminder').one()
        assert notification.data['url']=='/cart'
    actor(role='marketing_manager')
    segment=c.get('/v1/admin/marketing/segments');assert segment.status_code==200,segment.text
    assert next(p for p in segment.json()['segments'] if p['id']=='new')['count']>=1
    assert c.get('/v1/admin/operations/funnel').status_code==403


def test_buyer_pin_and_privacy_requests_are_private_and_not_fiscal_invoices(delivery):
    s=delivery;c=s['client'];actor('buyer','customer');ref=s['reference']
    assert c.put('/v1/app-orders/'+ref+'/tax-profile',json={'buyer_pin':'invalid'}).status_code==422
    result=c.put('/v1/app-orders/'+ref+'/tax-profile',json={'buyer_pin':'A123456789Z'})
    assert result.status_code==200,result.text
    assert result.json()['state']=='awaiting_configuration'
    request={'request_key':'privacy-test-request-123','kind':'correction','details':'Please correct my delivery contact.'}
    first=c.post('/v1/account/privacy/requests',json=request);assert first.status_code==200,first.text
    assert c.post('/v1/account/privacy/requests',json=request).json()['id']==first.json()['id']
    actor('other','customer')
    assert c.get('/v1/account/privacy/requests').json()==[]
    assert c.put('/v1/app-orders/'+ref+'/tax-profile',json={'buyer_pin':'A123456789Z'}).status_code==404
    assert c.get('/v1/admin/compliance').status_code==403
    actor(role='admin');assert c.get('/v1/admin/compliance').json()['etims']['certified'] is False


def test_corporate_accepted_quote_becomes_one_app_order_at_the_approved_discount(system):
    s=system;c=s['client'];actor(role='admin')
    company=c.post('/v1/business/companies',json={'request_key':'corporate-order-test-123','name':'App Order Co','billing_address':'Nairobi','industry':'Office','email':'buyer@example.com','first_name':'Test','last_name':'Buyer','password':'Test-only-password-123'})
    assert company.status_code==201,company.text
    root='/v1/business/companies/'+company.json()['id']
    with Session(s['engine']) as db:
        product=db.get(AppProduct,12);product.payload={**product.payload,'name':'Caramel Cake 2kg'};db.commit()
    doc=c.post(root+'/documents',json={'request_key':'corporate-order-quote-123','kind':'quote','lines':[{'product_id':12,'quantity':1}]}).json()
    actor('buyer','corporate_client')
    assert c.post(root+'/documents/'+doc['id']+'/status',json={'revision':1,'status':'accepted'}).status_code==200
    basket=c.get(root+'/documents/'+doc['id']+'/basket');assert basket.status_code==200,basket.text
    assert basket.json()['lines'][0]['price']==2500
    s['payload']['corporate_quote_id']=doc['id']
    q=c.post('/v1/app-checkout/quote',json=s['payload']);assert q.status_code==200,q.text
    assert q.json()['discount_minor']==12500
    from uuid import uuid4
    placed=c.post('/v1/app-orders',json={'quote_id':q.json()['id']},headers={'Idempotency-Key':uuid4().hex})
    assert placed.status_code==200,placed.text
    assert c.get(root+'/orders').json()[0]['reference']==placed.json()['reference']
    assert c.post('/v1/app-orders',json={'quote_id':q.json()['id']},headers={'Idempotency-Key':uuid4().hex}).status_code==409
    actor('other','customer');assert c.get(root+'/orders').status_code==404
    assert not s['calls']
    from app.commerce_models import AppOrder
    from app.business import record_order_payment
    from app.ecosystem_models import CorporateDocument
    with Session(s['engine']) as db:
        order=db.query(AppOrder).filter(AppOrder.reference==placed.json()['reference']).one()
        order.payment_state='completed';order.paid_at=datetime.now(UTC)
        record_order_payment(db,order);record_order_payment(db,order);db.commit()
        documents=db.query(CorporateDocument).filter(CorporateDocument.organization_id==company.json()['id']).all()
        assert len([d for d in documents if d.kind=='invoice'])==1
        assert len([d for d in documents if d.kind=='payment' and d.status=='verified'])==1
