"""App-only customer segmentation and consented checkout recovery."""
from datetime import UTC,datetime,timedelta
from uuid import uuid4
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException,Response
from pydantic import BaseModel,Field
from sqlalchemy import DateTime,Boolean,ForeignKey,JSON,String,select,func
from sqlalchemy.orm import Mapped,mapped_column,Session
from .db import Base,get_db
from .models import Customer
from .commerce_models import AppOrder,AppQuote,SalesRecord,AppPolicy
from .routes_club import member
from .permissions import audit
from .notifications import enqueue

SEGMENTS=['all','new','first_time','repeat','high_spenders','inactive','checkout_pending']
router=APIRouter(tags=['marketing-crm'])
class MarketingConsent(Base):
    __tablename__='marketing_consents'
    customer_id:Mapped[str]=mapped_column(ForeignKey('customers.id'),primary_key=True)
    enabled:Mapped[bool]=mapped_column(Boolean,default=False)
    payload:Mapped[dict]=mapped_column(JSON,default=dict)

class CheckoutActivity(Base):
    __tablename__='checkout_activity'
    customer_id:Mapped[str]=mapped_column(ForeignKey('customers.id'),primary_key=True)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    payload:Mapped[dict]=mapped_column(JSON,default=dict)

class CheckoutPresence(BaseModel):
    product_ids:list[int]=Field(max_length=30)
@router.put('/v1/account/checkout-activity')
def checkout_activity(data:CheckoutPresence,actor=Depends(member),db:Session=Depends(get_db)):
    row=db.get(CheckoutActivity,actor.id)
    if not row:row=CheckoutActivity(customer_id=actor.id);db.add(row)
    row.updated_at=datetime.now(UTC);row.payload={'product_ids':list(dict.fromkeys(data.product_ids)),'converted':False}
    db.commit();return {'status':'saved'}

def staff(actor=Depends(member)):
    if actor.role not in {'admin','staff','ecommerce_manager','marketing_manager','content_manager'}:raise HTTPException(403,'Marketing access required')
    return actor

def settings(db):
    row=db.get(AppPolicy,'marketing-crm')
    return {'high_spender_minor':5000000,'inactive_days':90,'reminder_minutes':30,'reminders_enabled':True,**(row.payload if row else {})}

def profile(db,identity,config=None):
    cfg=config or settings(db);now=datetime.now(UTC)
    # Review orders can establish repeat behaviour, but never inflate monetary spend.
    orders=list(db.scalars(select(AppOrder).where(AppOrder.customer_id==identity,AppOrder.payment_state=='completed',AppOrder.state.notin_(['cancelled','payment_failed']))))
    live=sum(db.scalars(select(SalesRecord.paid_minor-SalesRecord.reversed_minor).join(AppOrder,AppOrder.reference==SalesRecord.reference).where(AppOrder.customer_id==identity,SalesRecord.channel=='app',SalesRecord.environment=='live',SalesRecord.currency=='KES')))
    last=max((o.paid_at or o.created_at for o in orders),default=None)
    if last and last.tzinfo is None:last=last.replace(tzinfo=UTC)
    pending=bool(db.scalar(select(AppQuote.id).where(AppQuote.customer_id==identity,AppQuote.expires_at>now).limit(1))) and not any((o.created_at.replace(tzinfo=UTC) if o.created_at.tzinfo is None else o.created_at)>now-timedelta(minutes=cfg['reminder_minutes']) for o in orders)
    groups=['all']
    if not orders:groups.append('new')
    if len(orders)==1:groups.append('first_time')
    if len(orders)>=2:groups.append('repeat')
    if live>=cfg['high_spender_minor']:groups.append('high_spenders')
    if last and last<now-timedelta(days=cfg['inactive_days']):groups.append('inactive')
    if pending:groups.append('checkout_pending')
    return {'segments':groups,'purchases':len(orders),'net_spend_minor':live,'last_purchase':last}

def matches(db,identity,segment):return segment=='all' or segment in profile(db,identity)['segments']

class ConsentInput(BaseModel):enabled:bool
@router.get('/v1/account/marketing-consent')
def consent(actor=Depends(member),db:Session=Depends(get_db)):
    row=db.get(MarketingConsent,actor.id);return {'enabled':bool(row and row.enabled)}
@router.put('/v1/account/marketing-consent')
def set_consent(data:ConsentInput,actor=Depends(member),db:Session=Depends(get_db)):
    row=db.get(MarketingConsent,actor.id)
    if not row:row=MarketingConsent(customer_id=actor.id);db.add(row)
    row.enabled=data.enabled;row.payload={'updated_at':datetime.now(UTC).isoformat(),'source':'account_choice'}
    audit(db,actor.id,'marketing.consent_changed',actor.id,enabled=data.enabled);db.commit();return {'enabled':row.enabled}

@router.get('/v1/admin/marketing/segments')
def segments(response:Response,actor=Depends(staff),db:Session=Depends(get_db)):
    response.headers['Cache-Control']='private, no-store'
    counts={s:0 for s in SEGMENTS};cfg=settings(db)
    for person in db.scalars(select(Customer).where(Customer.role.in_(['customer','corporate_client']))):
        for segment in profile(db,person.id,cfg)['segments']:counts[segment]+=1
    return {'settings':cfg,'segments':[{'id':s,'label':s.replace('_',' ').title(),'count':counts[s]} for s in SEGMENTS],'definition':'App orders only. High spend uses verified live net collections; no-charge review orders count toward purchase frequency only. Segments can overlap.'}

class RecoverySettings(BaseModel):
    high_spender_minor:int=Field(ge=10000,le=1000000000)
    inactive_days:int=Field(ge=7,le=730)
    reminder_minutes:int=Field(ge=15,le=1440)
    reminders_enabled:bool=False
@router.put('/v1/admin/marketing/settings')
def configure(data:RecoverySettings,actor=Depends(staff),db:Session=Depends(get_db)):
    row=db.get(AppPolicy,'marketing-crm')
    if not row:row=AppPolicy(id='marketing-crm');db.add(row)
    row.payload=data.model_dump();audit(db,actor.id,'marketing.settings_updated','marketing-crm');db.commit();return settings(db)

def _recover(db):
    cfg=settings(db)
    if not cfg['reminders_enabled']:return 0
    now=datetime.now(UTC);count=0
    # One reminder per customer per day; never try to charge or replay an expired quote.
    for person in db.scalars(select(Customer).join(MarketingConsent,MarketingConsent.customer_id==Customer.id).where(MarketingConsent.enabled.is_(True),Customer.role.in_(['customer','corporate_client'])).with_for_update(skip_locked=True)):
        activity=db.get(CheckoutActivity,person.id)
        if activity:
            if activity.payload.get('converted') or not activity.payload.get('product_ids'):continue
            at=activity.updated_at.replace(tzinfo=UTC) if activity.updated_at.tzinfo is None else activity.updated_at
            if at<now-timedelta(days=1):continue
        else:
            q=db.scalar(select(AppQuote).where(AppQuote.customer_id==person.id,AppQuote.expires_at>now-timedelta(days=1)).order_by(AppQuote.expires_at.desc()).limit(1))
            if not q:continue
            expiry=q.expires_at.replace(tzinfo=UTC) if q.expires_at.tzinfo is None else q.expires_at
            at=expiry-timedelta(minutes=10)
        if at>now-timedelta(minutes=cfg['reminder_minutes']):continue
        if db.scalar(select(AppOrder.id).where(AppOrder.customer_id==person.id,AppOrder.created_at>=at,AppOrder.payment_state.in_(['completed','pending','creating','uncertain'])).limit(1)):continue
        from .notification_models import AccountNotification
        key='checkout-reminder:'+person.id+':'+now.strftime('%Y-%m-%d')
        if db.scalar(select(AccountNotification.id).where(AccountNotification.event_key==key)):continue
        enqueue(db,person.id,key,'checkout_reminder','Your celebration is waiting','Your bag is waiting. Open Cake City to review availability and complete your order.',{'url':'/cart','marketing':True})
        count+=1
    db.commit();return count

@router.get('/v1/admin/marketing/clients')
def clients(segment:Literal['all','new','first_time','repeat','high_spenders','inactive','checkout_pending']='all',page:int=1,actor=Depends(staff),db:Session=Depends(get_db)):
    if page<1:raise HTTPException(422,'Choose a positive page')
    cfg=settings(db);result=[]
    for person in db.scalars(select(Customer).where(Customer.role.in_(['customer','corporate_client'])).order_by(Customer.first_name,Customer.id)):
        data=profile(db,person.id,cfg)
        if segment in data['segments']:
            consent=db.get(MarketingConsent,person.id)
            result.append({'id':person.id,'name':(person.first_name+' '+person.last_name).strip(),'email':person.email,'phone':person.phone,'marketing_consent':bool(consent and consent.enabled),**data})
    start=(page-1)*20
    return {'items':result[start:start+20],'page':page,'total':len(result),'has_more':start+20<len(result)}

@router.get('/v1/admin/operations/funnel')
def funnel(actor=Depends(member),db:Session=Depends(get_db)):
    if actor.role not in {'admin','staff','ecommerce_manager'}:raise HTTPException(403,'Administration access required')
    from .logistics_models import ProductionTask,LogisticsTask
    from .notification_models import OrderReview
    from .ecosystem_models import CorporateDocument
    from .models import Enquiry
    from .service_desk import DeskCase
    def total(model,*filters):return db.scalar(select(func.count()).select_from(model).where(*filters)) or 0
    stages=[('quotes','Checkout quotes',total(AppQuote)),('awaiting_payment','Awaiting payment',total(AppOrder,AppOrder.payment_state.in_(['not_started','pending','creating','uncertain']))),('paid','Confirmed orders',total(AppOrder,AppOrder.payment_state=='completed')),('production','Kitchen tasks',total(ProductionTask)),('dispatch','Delivery trips',total(LogisticsTask)),('completed','Completed orders',total(AppOrder,AppOrder.state=='completed')),('reviews','Customer ratings',total(OrderReview)),('enquiries','Customer enquiries',total(Enquiry)),('agents','Agent-owned cases',total(DeskCase)),('corporate_quotes','Corporate quotes',total(CorporateDocument,CorporateDocument.kind=='quote')),('corporate_invoices','Corporate invoices',total(CorporateDocument,CorporateDocument.kind=='invoice'))]
    return {'stages':[{'id':key,'label':label,'count':value} for key,label,value in stages],'definition':'Independent app operational totals, including local review. These are workload counts, not conversion rates or collected revenue. Website orders are excluded.'}


def recover(db):
    from sqlalchemy.exc import IntegrityError
    try:return _recover(db)
    except IntegrityError:
        # Concurrent SQLite/retry workers may race the unique inbox event key.
        # The winning transaction owns the reminder; the worker can continue.
        db.rollback();return 0
