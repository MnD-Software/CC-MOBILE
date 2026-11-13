from uuid import uuid4
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.commerce_models import AppProduct, AppCoupon
from app.main import app
from app import review_checkout
from test_pesapal import system
from test_logistics import actor
from test_review_checkout import review_routes


def test_inventory_diy_reprices_the_actual_variation_and_extras(system):
    s=system
    with Session(s['engine']) as db:
        base=db.get(AppProduct,12)
        base.payload={**base.payload,'type':'variable','order_mode':'made_to_order'}
        db.add(AppProduct(id=13,parent_id=12,slug='cake-variation',payload={'name':'Cake','type':'variation','order_mode':'made_to_order','variation_attributes':[{'name':'Size','value':'1-5kg-serves-15'},{'name':'Icing','value':'with-cream'}]},price_minor=350000,enabled=True))
        db.add(AppProduct(id=14,slug='sparkling-candles',payload={'name':'Sparkling Candles','type':'simple','order_mode':'made_to_order','categories':[{'name':'Candles'}]},price_minor=40000,enabled=True))
        db.commit()
    inventory=s['client'].get('/v1/diy/inventory').json()
    assert inventory[0]['variants'][0]['id']==13
    data={'product_id':12,'variation_id':13,'extras':[14],'colour':'#F7B6D2','message':'Happy birthday'}
    quote=s['client'].post('/v1/diy/quote',json=data)
    assert quote.status_code==200,quote.text
    assert quote.json()['subtotal_minor']==390000
    assert quote.json()['lines'][0]['size']=='1.5kg'
    with Session(s['engine']) as db:
        db.get(AppProduct,13).price_minor=360000
        db.commit()
    assert s['client'].post('/v1/diy/quote',json=data).json()['subtotal_minor']==400000
    assert s['client'].post('/v1/diy/quote',json={**data,'extras':[14,14]}).status_code==422
    assert s['client'].post('/v1/diy/quote',json={**data,'variation_id':99999}).status_code==409
    assert s['client'].post('/v1/diy/quote',json={**data,'colour':'<script>'}).status_code==422


def test_welcome_is_private_once_only_and_redeems_with_no_charge(review_routes):
    s=review_routes
    response=s['client'].post('/v1/account/coupons/welcome')
    assert response.status_code==200,response.text
    coupon=response.json()['coupon']
    assert coupon['amount_minor']==10000
    assert s['client'].post('/v1/account/coupons/welcome').json()['coupon']['code']==coupon['code']
    s['payload']['coupon_code']=coupon['code']
    actor('other','customer')
    assert s['client'].post('/v1/app-checkout/quote',json=s['payload']).status_code==409
    actor('buyer','customer')
    quote=s['client'].post('/v1/app-checkout/quote',json=s['payload']).json()
    assert quote['discount_minor']==10000 and quote['total_minor']==240000
    response=s['client'].post('/v1/review-checkout/orders',json={'quote_id':quote['id']},headers={'Idempotency-Key':uuid4().hex})
    assert response.status_code==200,response.text
    assert response.json()['due_now_minor']==0 and response.json()['payment_state']=='completed'
    with Session(s['engine']) as db:
        assert db.get(AppCoupon,coupon['code']).uses==1
    assert s['client'].post('/v1/account/coupons/welcome').json()['coupon'] is None
    assert not s['calls']


def test_pickup_branch_and_customer_pin_reach_the_order_snapshot(review_routes):
    s=review_routes
    s['payload'].update(pickup_location_id='imaara-mall-embakasi')
    result=s['client'].post('/v1/app-checkout/quote',json=s['payload'])
    assert result.status_code==200,result.text
    assert 'Embakasi' in result.json()['pickup_instructions']
    s['payload']['pickup_location_id']='arcadia-mall-athi-river'
    assert s['client'].post('/v1/app-checkout/quote',json=s['payload']).status_code==409
    s['payload'].update(pickup_location_id=None,fulfilment='delivery',delivery_zone_id='zone',delivery_location={'latitude':-1.27,'longitude':36.82})
    result=s['client'].post('/v1/app-checkout/quote',json=s['payload'])
    assert result.status_code==200,result.text
    assert result.json()['checkout']['delivery_location']==s['payload']['delivery_location']
    s['payload']['delivery_location']={'latitude':999,'longitude':36.82}
    assert s['client'].post('/v1/app-checkout/quote',json=s['payload']).status_code==422


def test_customer_delivery_rate_uses_minimum_not_an_added_base():
    from app.app_delivery import delivery_fee
    assert delivery_fee(1000)==10000
    assert delivery_fee(5000)==15000
    assert delivery_fee(10000)==30000


def test_referrals_from_completed_review_orders_can_be_redeemed_as_app_coupons(review_routes):
    from app.models import Customer, ClubReferral
    from app.routes_club_benefits import sync_referral
    from app.commerce_models import AppOrder
    s=review_routes
    with Session(s['engine']) as db:
        db.add(Customer(id='inviter',email='inviter@example.com',first_name='Inviter',last_name='Test',password_hash='unused',role='customer'))
        db.flush()
        for buyer in ['buyer','other']:
            db.add(ClubReferral(referee_id=buyer,inviter_id='inviter'))
        db.commit()
    for buyer in ['buyer','other']:
        actor(buyer,'customer')
        quote=s['client'].post('/v1/app-checkout/quote',json=s['payload']).json()
        order=s['client'].post('/v1/review-checkout/orders',json={'quote_id':quote['id']},headers={'Idempotency-Key':uuid4().hex}).json()
        with Session(s['engine']) as db:
            row=db.scalar(select(AppOrder).where(AppOrder.reference==order['reference']))
            row.state='completed'
            db.commit()
            sync_referral(buyer,row.reference,'completed',db)
            sync_referral(buyer,row.reference,'completed',db)
    actor('inviter','customer')
    club=s['client'].get('/v1/club').json()
    assert club['points']==100
    reward=s['client'].post('/v1/club/redeem',json={'points':100,'request_key':'redeem-review-referrals-123'})
    assert reward.status_code==200,reward.text
    code=reward.json()['code']
    with Session(s['engine']) as db:
        assert db.get(AppCoupon,code).customer_id=='inviter'
    offers=s['client'].post('/v1/account/coupons/available',json={'saved_codes':[code],'subtotal_minor':2500000})
    assert any(c['code']==code and c['eligible'] for c in offers.json()['coupons'])
    assert not s['calls']
