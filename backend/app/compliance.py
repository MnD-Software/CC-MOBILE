"""Tax/rights records and configuration readiness, not eTIMS certification."""
from datetime import UTC,datetime
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter,Depends,HTTPException,Response
from pydantic import BaseModel,Field,ConfigDict
from sqlalchemy import ForeignKey,JSON,String,UniqueConstraint,select
from sqlalchemy.orm import Mapped,mapped_column,Session
from .db import Base,get_db
from .routes_club import member
from .commerce_models import AppOrder,AppPolicy
from .permissions import audit

router=APIRouter(tags=['tax-and-privacy-readiness'])


class TaxInvoiceRequest(Base):
    __tablename__='tax_invoice_requests'
    order_id:Mapped[int]=mapped_column(ForeignKey('app_orders.id'),primary_key=True)
    buyer_pin:Mapped[str]=mapped_column(String(11))
    payload:Mapped[dict]=mapped_column(JSON,default=dict)


class PrivacyRequest(Base):
    __tablename__='privacy_rights_requests'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    customer_id:Mapped[str]=mapped_column(ForeignKey('customers.id'),index=True)
    request_key:Mapped[str]=mapped_column(String(80))
    payload:Mapped[dict]=mapped_column(JSON)
    __table_args__=(UniqueConstraint('customer_id','request_key'),)


class TaxProfile(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    buyer_pin:str=Field(pattern=r'^[A-Z][0-9]{9}[A-Z]$')


@router.put('/v1/app-orders/{reference}/tax-profile')
def tax_profile(reference:str,data:TaxProfile,actor=Depends(member),db:Session=Depends(get_db)):
    order=db.scalar(select(AppOrder).where(AppOrder.reference==reference,AppOrder.customer_id==actor.id).with_for_update())
    if not order:raise HTTPException(404,'Order not found')
    if order.payment_state!='completed':raise HTTPException(409,'Tax invoice requests require a confirmed order')
    record=db.get(TaxInvoiceRequest,order.id)
    if record and record.payload.get('state')=='issued':raise HTTPException(409,'An issued tax invoice requires a formal correction; contact support')
    if not record:
        record=TaxInvoiceRequest(order_id=order.id,buyer_pin=data.buyer_pin,payload={})
        db.add(record)
    record.buyer_pin=data.buyer_pin
    record.payload={'state':'awaiting_configuration','requested_at':datetime.now(UTC).isoformat(),'review_checkout':bool(order.snapshot.get('review_checkout'))}
    audit(db,actor.id,'tax_invoice.requested',reference) # Never copy buyer PIN into audit logs.
    db.commit()
    return {'state':'awaiting_configuration','buyer_pin':record.buyer_pin,'message':'Your PIN has been saved for this receipt. The team will arrange the tax invoice; this is not yet an eTIMS invoice.'}


def tax_view(db,order):
    row=db.get(TaxInvoiceRequest,order.id)
    pin=row.buyer_pin if row else order.snapshot.get('checkout',{}).get('billing',{}).get('kra_pin')
    return {'buyer_pin':pin,'state':row.payload.get('state','awaiting_configuration') if row else 'awaiting_configuration'} if pin else None


class RightsInput(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_key:str=Field(min_length=16,max_length=80,pattern=r'^[a-zA-Z0-9-]+$')
    kind:Literal['access','correction','objection','restriction','erasure','portability','complaint']
    details:str=Field(min_length=10,max_length=2000)


@router.post('/v1/account/privacy/requests')
def rights(data:RightsInput,actor=Depends(member),db:Session=Depends(get_db)):
    record=db.scalar(select(PrivacyRequest).where(PrivacyRequest.customer_id==actor.id,PrivacyRequest.request_key==data.request_key))
    if record:
        if record.payload['kind']!=data.kind or record.payload['details']!=data.details:raise HTTPException(409,'This request key belongs to another request')
    else:
        record=PrivacyRequest(id=str(uuid4()),customer_id=actor.id,request_key=data.request_key,payload={'kind':data.kind,'details':data.details,'status':'submitted','created_at':datetime.now(UTC).isoformat()})
        db.add(record);audit(db,actor.id,'privacy_rights.requested',record.id,kind=data.kind);db.commit()
    return {'id':record.id,**record.payload}


@router.get('/v1/account/privacy/requests')
def my_rights(response:Response,actor=Depends(member),db:Session=Depends(get_db)):
    response.headers['Cache-Control']='private, no-store'
    return [{'id':r.id,**r.payload} for r in db.scalars(select(PrivacyRequest).where(PrivacyRequest.customer_id==actor.id))]


class ComplianceSettings(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    legal_name:str=Field(default='',max_length=160)
    business_pin:str=Field(default='',pattern=r'^$|^[A-Z][0-9]{9}[A-Z]$')
    privacy_contact:str=Field(default='',max_length=254)
    odpc_registration_reference:str=Field(default='',max_length=100)
    retention_policy:str=Field(default='',max_length=4000)
    processor_and_transfer_register:str=Field(default='',max_length=4000)
    lawful_basis_and_purposes:str=Field(default='',max_length=4000)
    incident_response_plan:str=Field(default='',max_length=4000)
    policy_reviewed:bool=False


def admin(actor=Depends(member)):
    if actor.role!='admin':raise HTTPException(403,'Administrator access required')
    return actor


@router.get('/v1/admin/compliance')
def readiness(response:Response,actor=Depends(admin),db:Session=Depends(get_db)):
    response.headers['Cache-Control']='private, no-store'
    settings=db.get(AppPolicy,'compliance')
    return {'settings':settings.payload if settings else ComplianceSettings().model_dump(),
        'etims':{'state':'not_connected','certified':False,'requires':['KRA onboarding and approved OSCU/VSCU integration','Business tax registration and item/tax mapping','Private credentials and sandbox acceptance','Production verification before issuing fiscal invoices']},
        'tax_requests':[{'reference':db.get(AppOrder,r.order_id).reference,'buyer_pin':r.buyer_pin,**r.payload} for r in db.scalars(select(TaxInvoiceRequest).limit(100))],
        'privacy_requests':[{'id':r.id,'customer_id':r.customer_id,**r.payload} for r in db.scalars(select(PrivacyRequest).limit(100))]}


@router.put('/v1/admin/compliance/settings')
def configure(data:ComplianceSettings,actor=Depends(admin),db:Session=Depends(get_db)):
    row=db.get(AppPolicy,'compliance')
    if not row:row=AppPolicy(id='compliance',payload={});db.add(row)
    row.payload=data.model_dump();audit(db,actor.id,'compliance.settings_updated','compliance');db.commit()
    return {'status':'saved','etims_connected':False}


class RightsUpdate(BaseModel):
    status:Literal['reviewing','fulfilled','declined']
    response:str=Field(min_length=10,max_length=2000)


@router.patch('/v1/admin/compliance/privacy/{identity}')
def resolve_rights(identity:str,data:RightsUpdate,actor=Depends(admin),db:Session=Depends(get_db)):
    row=db.get(PrivacyRequest,identity)
    if not row:raise HTTPException(404,'Request not found')
    row.payload={**row.payload,'status':data.status,'response':data.response,'updated_at':datetime.now(UTC).isoformat()}
    from .notifications import enqueue
    enqueue(db,row.customer_id,'privacy:'+row.id+':'+str(uuid4()),'support_reply','Your privacy request has an update','Open Privacy & account to read the response.',{'url':'/account-privacy'})
    audit(db,actor.id,'privacy_rights.updated',identity,status=data.status);db.commit()
    return {'id':row.id,**row.payload}
