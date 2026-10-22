from datetime import UTC, datetime, timedelta
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Customer, AdministrativeEvent
from sqlalchemy import select


@pytest.fixture
def client():
    with TestClient(app) as value:
        yield value


def login(client, role="customer"):
    email=f"{uuid4().hex}@example.com"
    result=client.post('/v1/auth/mobile/register',json={"email":email,"password":"long-test-password","first_name":"Corporate","last_name":"Test"}).json()
    with SessionLocal() as db:
        db.get(Customer,result['customer']['id']).role=role
        db.commit()
    return {"Authorization":"Bearer "+result['access_token']},email


def company(client, headers):
    response=client.post('/v1/corporate/organizations',headers=headers,json={"request_key":str(uuid4()),"name":"Celebration Company","billing_address":"Nairobi office building"})
    assert response.status_code==201
    return response.json()['id']


def test_companies_are_private_and_registration_is_idempotent(client):
    owner,_=login(client); stranger,_=login(client)
    data={"request_key":str(uuid4()),"name":"Team Cakes","billing_address":"Nairobi office"}
    first=client.post('/v1/corporate/organizations',headers=owner,json=data).json()
    assert client.post('/v1/corporate/organizations',headers=owner,json=data).json()['id']==first['id']
    assert client.post('/v1/corporate/organizations',headers=owner,json={**data,"name":"Other"}).status_code==409
    assert client.get('/v1/corporate/organizations',headers=stranger).json()==[]
    assert client.get(f"/v1/corporate/organizations/{first['id']}/quotes",headers=stranger).status_code==404
    assert first['credit_enabled'] is False


def test_invitations_are_email_bound_single_use_and_cannot_escalate_owner(client):
    owner,_=login(client); colleague,email=login(client); stranger,_=login(client)
    identity=company(client,owner); path=f'/v1/corporate/organizations/{identity}'
    assert client.post(path+'/invitations',headers=owner,json={'email':email,'role':'owner'}).status_code==422
    invitation=client.post(path+'/invitations',headers=owner,json={'email':email,'role':'viewer'}).json()
    assert client.post('/v1/corporate/invitations/accept',headers=stranger,json={'token':invitation['token']}).status_code==404
    assert client.post('/v1/corporate/invitations/accept',headers=colleague,json={'token':invitation['token']}).status_code==200
    assert client.post('/v1/corporate/invitations/accept',headers=colleague,json={'token':invitation['token']}).status_code==409
    assert client.post(path+'/invitations',headers=colleague,json={'email':email,'role':'approver'}).status_code==403
    assert client.post(path+'/quotes',headers=colleague,json={'request_key':str(uuid4()),'kind':'corporate','subject':'Event cake','details':'Office party for twenty people'}).status_code==403


def test_buyer_cannot_bypass_approval_through_personal_endpoint(client):
    owner,_=login(client); buyer,email=login(client); seller,_=login(client,'corporate_sales')
    identity=company(client,owner); path=f'/v1/corporate/organizations/{identity}'
    token=client.post(path+'/invitations',headers=owner,json={'email':email,'role':'buyer'}).json()['token']
    client.post('/v1/corporate/invitations/accept',headers=buyer,json={'token':token})
    data={'request_key':str(uuid4()),'kind':'corporate','subject':'Annual party','details':'Twenty people, next month, Nairobi'}
    result=client.post(path+'/quotes',headers=buyer,json=data)
    assert result.status_code==201
    quote=result.json()
    assert client.post(path+'/quotes',headers=buyer,json=data).json()['id']==quote['id']
    reply={'revision':1,'status':'quoted','response':'Cake and delivery quotation','quote_minor':500000,'quote_expires_at':(datetime.now(UTC)+timedelta(days=2)).isoformat()}
    assert client.patch('/v1/admin/enquiries/'+quote['id'],headers=seller,json=reply).status_code==200
    assert client.post(path+f"/quotes/{quote['id']}/accept",headers=buyer,json={'revision':2}).status_code==403
    assert client.post(f"/v1/account/enquiries/{quote['id']}/accept",headers=buyer,json={'revision':2}).status_code==403
    accepted=client.post(path+f"/quotes/{quote['id']}/accept",headers=owner,json={'revision':2})
    assert accepted.status_code==200 and accepted.json()['status']=='accepted'
    assert client.post(path+f"/quotes/{quote['id']}/accept",headers=owner,json={'revision':2}).status_code==200
    assert client.patch('/v1/admin/enquiries/'+quote['id'],headers=seller,json={**reply,'revision':3}).status_code==409
    with SessionLocal() as db:
        events=list(db.scalars(select(AdministrativeEvent).where(AdministrativeEvent.resource_id==quote['id'])))
        assert len(events)==3
        assert not any('token' in str(event.details) for event in events)


def test_workspace_enforces_database_permissions_after_role_change(client):
    finance,_=login(client,'finance'); sales,_=login(client,'sales'); user,_=login(client)
    assert client.get('/v1/admin/enquiries',headers=finance).status_code==403
    assert client.get('/v1/admin/enquiries',headers=sales).status_code==200
    assert client.get('/v1/admin/audit',headers=sales).status_code==403
    assert client.get('/v1/admin/audit',headers=finance).status_code==200
    assert client.get('/v1/workspace/session',headers=user).json()['permissions']==[]
    assert client.get('/v1/admin/enquiries').status_code==401


def test_owner_can_revoke_access_without_changing_owner(client):
    owner,_=login(client); colleague,email=login(client)
    identity=company(client,owner); path=f'/v1/corporate/organizations/{identity}'
    token=client.post(path+'/invitations',headers=owner,json={'email':email,'role':'buyer'}).json()['token']
    client.post('/v1/corporate/invitations/accept',headers=colleague,json={'token':token})
    members=client.get(path+'/members',headers=owner).json()
    owner_id=next(row['customer_id'] for row in members if row['role']=='owner')
    colleague_id=next(row['customer_id'] for row in members if row['role']=='buyer')
    assert client.put(path+'/members/'+owner_id,headers=owner,json={'role':'viewer'}).status_code==409
    assert client.delete(path+'/members/'+owner_id,headers=owner).status_code==409
    assert client.put(path+'/members/'+colleague_id,headers=owner,json={'role':'viewer'}).status_code==200
    assert client.delete(path+'/members/'+colleague_id,headers=owner).status_code==204
    assert client.get(path+'/quotes',headers=colleague).status_code==404
    assert client.post('/v1/corporate/invitations/accept',headers=colleague,json={'token':token}).status_code==409


def test_concurrent_company_registration_creates_one_company(client):
    owner,_=login(client)
    data={'request_key':str(uuid4()),'name':'Concurrent Company','billing_address':'Nairobi office'}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(lambda _:client.post('/v1/corporate/organizations',headers=owner,json=data),range(3)))
    assert all(result.status_code==201 for result in results)
    assert len({result.json()['id'] for result in results})==1
    assert len(client.get('/v1/corporate/organizations',headers=owner).json())==1
