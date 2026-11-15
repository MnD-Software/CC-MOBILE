"""Versioned design sign-off, verified product facts and opt-in journey signals."""
import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, delete, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column
from .db import Base, get_db
from .models import Customer
from .commerce_models import AppOrder, AppPolicy, AppProduct
from .routes_club import member
from .experience import MANAGERS, MARKETING, owned, permit, utc
from .permissions import audit

router = APIRouter(prefix='/v1/journey', tags=['journey'])
DESIGN = MANAGERS | {'production','head_chef','call_center_manager','call_center_agent','customer_service'}
FACTS = MANAGERS | {'head_chef','content_manager'}

def purge_measurements(db):
    db.execute(delete(JourneySignal).where(JourneySignal.created_at < datetime.now(UTC)-timedelta(days=30)))
    db.execute(delete(TripVerification).where(TripVerification.expires_at < datetime.now(UTC)-timedelta(hours=1)))
    db.commit()

class DesignProof(Base):
    __tablename__ = 'order_design_proofs'
    order_id: Mapped[int] = mapped_column(ForeignKey('app_orders.id'), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    state: Mapped[str] = mapped_column(String(24), default='awaiting_approval')
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

class JourneyConsent(Base):
    __tablename__ = 'journey_measurement_consent'
    customer_id: Mapped[str] = mapped_column(ForeignKey('customers.id'), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

class JourneySignal(Base):
    __tablename__ = 'journey_measurement_signals'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey('customers.id'), index=True)
    event_id: Mapped[str] = mapped_column(String(36))
    name: Mapped[str] = mapped_column(String(40), index=True)
    value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    environment: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
    __table_args__ = (UniqueConstraint('customer_id','event_id'),)

class TripVerification(Base):
    __tablename__='trip_verifications'
    task_id:Mapped[str]=mapped_column(ForeignKey('logistics_tasks.id'),primary_key=True)
    purpose:Mapped[str]=mapped_column(String(12),primary_key=True)
    revision:Mapped[int]=mapped_column(Integer)
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    payload:Mapped[dict]=mapped_column(JSON,default=dict)

def verification_code(row):
    from .config import get_settings
    value=f'{row.task_id}:{row.purpose}:{row.revision}:{row.payload["nonce"]}'
    return hmac.new(get_settings().jwt_secret.encode(),value.encode(),hashlib.sha256).hexdigest()[:10].upper()

def verification_view(db,task,purpose):
    from .logistics_models import LogisticsTask
    db.execute(update(LogisticsTask).where(LogisticsTask.id==task.id).values(revision=LogisticsTask.revision))
    db.refresh(task)
    expected='accepted' if purpose=='handover' else 'in_transit'
    if task.status!=expected: raise HTTPException(409,'This trip has moved to another stage.')
    row=db.get(TripVerification,(task.id,purpose))
    if not row:
        row=TripVerification(task_id=task.id,purpose=purpose,revision=task.revision,expires_at=datetime.now(UTC)+timedelta(minutes=20),payload={'nonce':secrets.token_hex(16),'attempts':0})
        db.add(row)
    elif row.revision!=task.revision or utc(row.expires_at)<=datetime.now(UTC) or row.payload.get('attempts',0)>=5:
        row.revision=task.revision;row.expires_at=datetime.now(UTC)+timedelta(minutes=20);row.payload={'nonce':secrets.token_hex(16),'attempts':0}
    code=verification_code(row)
    import qrcode
    from qrcode.image.svg import SvgPathFillImage
    qr=qrcode.make(f'cakecity:{purpose}:{task.id}:{code}',image_factory=SvgPathFillImage)
    image='data:image/svg+xml;base64,'+base64.b64encode(qr.to_string()).decode()
    db.commit()
    return {'task_id':task.id,'purpose':purpose,'code':code,'qr_data':image,'expires_at':row.expires_at}

@router.post('/staff/tasks/{identity}/handover-code')
def handover_code(identity:str,actor=Depends(member),db:Session=Depends(get_db)):
    from .logistics import KITCHEN,DISPATCH,require_plant
    from .logistics_models import LogisticsTask,ProductionTask
    permit(actor,KITCHEN|DISPATCH)
    task=db.get(LogisticsTask,identity)
    if not task: raise HTTPException(404,'Trip not found.')
    require_plant(db,actor,task.plant)
    if actor.role=='production':
        assignment=db.get(ProductionTask,task.order_id)
        if not assignment or assignment.assigned_to!=actor.id: raise HTTPException(403,'This trip belongs to another kitchen assignment.')
    order=db.get(AppOrder,task.order_id)
    if order.state not in {'ready','out_for_delivery'}: raise HTTPException(409,'The kitchen must mark this order ready first.')
    return verification_view(db,task,'handover')

@router.get('/orders/{reference}/delivery-codes')
def delivery_codes(reference:str,actor=Depends(member),db:Session=Depends(get_db)):
    from .logistics_models import LogisticsTask
    order=owned(db,actor,reference)
    tasks=list(db.scalars(select(LogisticsTask).where(LogisticsTask.order_id==order.id,LogisticsTask.status=='in_transit',LogisticsTask.service_type=='delivery')))
    return [verification_view(db,t,'delivery') for t in tasks]

def check_trip_verification(db,task,purpose,code):
    row=db.get(TripVerification,(task.id,purpose))
    if not row: return  # Existing/manual trips continue until a code has been issued.
    if utc(row.expires_at)<=datetime.now(UTC) or row.revision!=task.revision or row.payload.get('attempts',0)>=5:
        raise HTTPException(409,'Refresh the handover or customer delivery code before continuing.')
    if not hmac.compare_digest(verification_code(row),str(code).strip().upper()):
        row.payload={**row.payload,'attempts':row.payload.get('attempts',0)+1}
        db.commit()
        raise HTTPException(422,'The verification code does not match this trip.')

def team_order(db, actor, reference):
    permit(actor, DESIGN)
    order=db.scalar(select(AppOrder).where(AppOrder.reference==reference).with_for_update())
    if not order: raise HTTPException(404,'Order not found.')
    if actor.role in {'production','head_chef'}:
        from .logistics_models import ProductionTask
        from .logistics import require_plant
        task=db.get(ProductionTask,order.id)
        if not task: raise HTTPException(403,'Assign the production task first.')
        require_plant(db,actor,task.plant)
        if actor.role=='production' and task.assigned_to!=actor.id: raise HTTPException(403,'This design belongs to another kitchen assignment.')
    if actor.role in {'call_center_agent','customer_service'}:
        from .service_desk import DeskCase
        case=db.get(DeskCase,'order:'+reference)
        if not case or case.agent_id!=actor.id: raise HTTPException(403,'Claim this order in customer care first.')
    return order

def proof_view(row):
    if not row: return None
    return {'revision':row.revision,'state':row.state,**row.payload}

@router.get('/orders/{reference}/design')
def my_design(reference:str,actor=Depends(member),db:Session=Depends(get_db)):
    order=owned(db,actor,reference)
    return proof_view(db.get(DesignProof,order.id))

class ProofInput(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    revision:int=Field(ge=0)
    description:str=Field(min_length=10,max_length=2000)
    image_data:str=Field(default='',max_length=2800000)

def checked_image(value):
    if not value: return ''
    for mime, signature in [('image/png',b'\x89PNG\r\n\x1a\n'),('image/jpeg',b'\xff\xd8\xff')]:
        prefix='data:'+mime+';base64,'
        if value.startswith(prefix):
            try: raw=base64.b64decode(value[len(prefix):],validate=True)
            except ValueError: break
            if len(raw)<=2000000 and raw.startswith(signature): return value
    raise HTTPException(422,'Choose a PNG or JPEG design image up to 2 MB.')

@router.get('/staff/orders/{reference}/design')
def staff_design(reference:str,actor=Depends(member),db:Session=Depends(get_db)):
    order=team_order(db,actor,reference)
    return proof_view(db.get(DesignProof,order.id))

@router.put('/staff/orders/{reference}/design')
def publish_design(reference:str,data:ProofInput,actor=Depends(member),db:Session=Depends(get_db)):
    order=team_order(db,actor,reference)
    if order.payment_state!='completed' or order.state!='paid': raise HTTPException(409,'Publish designs for confirmed orders before production starts.')
    db.execute(update(AppOrder).where(AppOrder.id==order.id).values(state=AppOrder.state))
    db.refresh(order)
    if order.payment_state!='completed' or order.state!='paid': raise HTTPException(409,'Production has already started. Contact the kitchen.')
    row=db.get(DesignProof,order.id)
    if (row.revision if row else 0)!=data.revision: raise HTTPException(409,'Design changed. Reload the current version.')
    if row and len(row.payload.get('history',[]))>=30: raise HTTPException(409,'Design revision limit reached. Contact a manager.')
    image=checked_image(data.image_data)
    # History stores approval decisions and description, not copies of large images.
    history=[*row.payload.get('history',[]),{'revision':row.revision,'state':row.state,'description':row.payload.get('description'),'at':datetime.now(UTC).isoformat()}] if row else []
    revision=data.revision+1
    payload={'description':data.description,'image_data':image,'history':history,'published_at':datetime.now(UTC).isoformat(),'customer_note':''}
    if row:
        changed=db.execute(update(DesignProof).where(DesignProof.order_id==order.id,DesignProof.revision==data.revision).values(revision=revision,state='awaiting_approval',payload=payload))
        if changed.rowcount!=1: raise HTTPException(409,'Design changed. Reload it.')
        db.refresh(row)
    else: row=DesignProof(order_id=order.id,revision=revision,state='awaiting_approval',payload=payload);db.add(row)
    from .notifications import enqueue
    enqueue(db,order.customer_id,f'design:{order.id}:{revision}','design_approval','Your cake design is ready to review','Review the design in your order before the kitchen begins.',{'reference':reference},remote=not order.snapshot.get('review_checkout'))
    audit(db,actor.id,'design.published',reference,revision=revision)
    db.commit();return proof_view(row)

class DesignDecision(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    revision:int=Field(ge=1)
    decision:Literal['approved','changes_requested']
    note:str=Field(default='',max_length=1000)

@router.post('/orders/{reference}/design')
def decide_design(reference:str,data:DesignDecision,actor=Depends(member),db:Session=Depends(get_db)):
    order=owned(db,actor,reference)
    db.execute(update(AppOrder).where(AppOrder.id==order.id).values(state=AppOrder.state))
    db.refresh(order)
    row=db.get(DesignProof,order.id)
    if not row: raise HTTPException(404,'Design not found.')
    if row.revision==data.revision and row.state==data.decision and row.payload.get('customer_note','')==data.note: return proof_view(row)
    if order.state!='paid': raise HTTPException(409,'This order has already moved into production. Contact customer care.')
    if data.decision=='changes_requested' and len(data.note)<5: raise HTTPException(422,'Tell the team what needs changing.')
    changed=db.execute(update(DesignProof).where(DesignProof.order_id==order.id,DesignProof.revision==data.revision,DesignProof.state=='awaiting_approval').values(state=data.decision,payload={**row.payload,'customer_note':data.note,'decided_at':datetime.now(UTC).isoformat()}))
    if changed.rowcount!=1: raise HTTPException(409,'Design changed. Review the latest version.')
    audit(db,actor.id,'design.'+data.decision,reference,revision=data.revision)
    db.commit();db.refresh(row);return proof_view(row)

def require_design_approval(db,order):
    row=db.get(DesignProof,order.id)
    if not row and any(line.get('selection',{}).get('design_colour') for line in order.snapshot.get('lines',[])):
        raise HTTPException(409,'Publish the custom cake design for customer approval before production begins.')
    if row and row.state!='approved': raise HTTPException(409,'The customer must approve the current design before production begins.')

class ProductFacts(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    revision:int=Field(default=0,ge=0)
    published:bool=False
    ingredients:str=Field(default='',max_length=1500)
    contains:list[str]=Field(default_factory=list,max_length=20)
    may_contain:list[str]=Field(default_factory=list,max_length=20)
    dietary:list[str]=Field(default_factory=list,max_length=10)
    handling:str=Field(default='',max_length=1000)
    source:str=Field(default='',max_length=500)

@router.get('/products/{identity}/facts')
def facts(identity:int,db:Session=Depends(get_db)):
    product=db.get(AppProduct,identity)
    if not product or not product.enabled: raise HTTPException(404,'Product not found.')
    row=db.get(AppPolicy,'facts:'+str(identity))
    return {k:v for k,v in row.payload.items() if k!='source'} if row and row.payload.get('published') else None

@router.get('/staff/products/{identity}/facts')
def staff_facts(identity:int,actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,FACTS)
    if not db.get(AppProduct,identity): raise HTTPException(404,'Product not found.')
    row=db.get(AppPolicy,'facts:'+str(identity))
    return row.payload if row else ProductFacts().model_dump()

@router.put('/staff/products/{identity}/facts')
def save_facts(identity:int,data:ProductFacts,actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,FACTS)
    product=db.get(AppProduct,identity)
    if not product: raise HTTPException(404,'Product not found.')
    db.execute(update(AppProduct).where(AppProduct.id==identity).values(revision=AppProduct.revision))
    row=db.get(AppPolicy,'facts:'+str(identity))
    revision=row.payload.get('revision',0) if row else 0
    if revision!=data.revision: raise HTTPException(409,'Product facts changed. Reload before saving.')
    if data.published and (len(data.source)<5 or len(data.ingredients)<5 or len(data.handling)<5): raise HTTPException(422,'Publishing requires a verified recipe source, ingredients and handling guidance.')
    if any(not x.strip() or len(x)>80 for x in data.contains+data.may_contain+data.dietary): raise HTTPException(422,'Use short, non-empty dietary and allergen labels.')
    payload={**data.model_dump(),'revision':revision+1,'verified_at':datetime.now(UTC).isoformat()}
    if row: row.payload=payload
    else: db.add(AppPolicy(id='facts:'+str(identity),payload=payload))
    audit(db,actor.id,'product.facts_updated',str(identity),published=data.published)
    db.commit();return payload

@router.get('/consent')
def consent(actor=Depends(member),db:Session=Depends(get_db)):
    row=db.get(JourneyConsent,actor.id)
    return {'enabled':bool(row and row.enabled)}

class ConsentInput(BaseModel):
    enabled:bool

@router.put('/consent')
def save_consent(data:ConsentInput,actor=Depends(member),db:Session=Depends(get_db)):
    db.execute(update(Customer).where(Customer.id==actor.id).values(first_name=Customer.first_name))
    row=db.get(JourneyConsent,actor.id)
    if not row: row=JourneyConsent(customer_id=actor.id);db.add(row)
    row.enabled=data.enabled
    if not data.enabled: db.execute(delete(JourneySignal).where(JourneySignal.customer_id==actor.id))
    db.commit();return {'enabled':data.enabled}

EventName=Literal['search_started','search_completed','product_viewed','quick_add','cart_viewed','checkout_started','payment_started','payment_success','payment_failed','custom_cake_started','custom_cake_completed','coupon_applied','reward_redeemed','reorder_started','reorder_completed','notification_opened','image_load_ms']
class SignalInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    event_id:str=Field(pattern=r'^[a-zA-Z0-9-]{16,36}$')
    name:EventName
    value:int|None=Field(default=None,ge=0,le=600000)
class Signals(BaseModel):
    model_config=ConfigDict(extra='forbid')
    events:list[SignalInput]=Field(max_length=30)

@router.post('/signals')
def signals(data:Signals,actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,{'customer'})
    db.execute(update(Customer).where(Customer.id==actor.id).values(first_name=Customer.first_name))
    if not consent(actor,db)['enabled']: raise HTTPException(403,'Optional journey measurement is disabled.')
    now=datetime.now(UTC)
    db.execute(delete(JourneySignal).where(JourneySignal.created_at<now-timedelta(days=30)))
    if db.scalar(select(func.count()).select_from(JourneySignal).where(JourneySignal.customer_id==actor.id,JourneySignal.created_at>now-timedelta(days=1)))>=500:
        raise HTTPException(429,'Daily measurement limit reached.')
    from .config import get_settings
    environment='live' if get_settings().environment.casefold()=='production' else 'development'
    for event in data.events:
        if not db.scalar(select(JourneySignal.id).where(JourneySignal.customer_id==actor.id,JourneySignal.event_id==event.event_id)):
            db.add(JourneySignal(id=str(uuid4()),customer_id=actor.id,event_id=event.event_id,name=event.name,value=event.value if event.name=='image_load_ms' else None,environment=environment))
            db.flush()
    db.commit();return {'accepted':True}

@router.get('/staff/funnel')
def funnel(environment:Literal['live','development']='live',actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,MARKETING)
    since=datetime.now(UTC)-timedelta(days=30)
    counts=list(db.execute(select(JourneySignal.name,func.count(),func.count(func.distinct(JourneySignal.customer_id))).where(JourneySignal.created_at>=since,JourneySignal.environment==environment).group_by(JourneySignal.name).order_by(JourneySignal.name)))
    image_filter=(JourneySignal.name=='image_load_ms',JourneySignal.created_at>=since,JourneySignal.environment==environment,JourneySignal.value.is_not(None))
    image_count=db.scalar(select(func.count()).select_from(JourneySignal).where(*image_filter))
    def percentile(fraction):
        return db.scalar(select(JourneySignal.value).where(*image_filter).order_by(JourneySignal.value).offset(min(image_count-1,int(image_count*fraction))).limit(1)) if image_count else None
    return {'environment':environment,'days':30,'definition':'Opt-in app activity, not all customers or verified sales. Steps count unique customers independently; this is not a sequenced conversion rate.',
        'items':[{'name':name,'events':count,'customers':people} for name,count,people in counts],
        'image_p50_ms':percentile(.5),'image_p95_ms':percentile(.95)}
