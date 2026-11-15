"""Customer shortcuts and staff follow-through on the existing app order ledger."""
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, select, update, func
from sqlalchemy.orm import Mapped, Session, mapped_column
from .db import Base, get_db
from .models import Customer
from .commerce_models import AppOrder, AppProduct, AppPolicy, AppOrderEvent, SalesRecord, AppCoupon
from .routes_club import member
from .permissions import audit

router = APIRouter(prefix='/v1/experience', tags=['experience'])
MANAGERS = {'admin', 'staff', 'ecommerce_manager'}
DISPATCH_MANAGERS = {'dispatch'}  # Existing Dispatch Manager workspace account; branch dispatch cannot override.
SLOT_STAFF = MANAGERS | DISPATCH_MANAGERS
OPERATORS = MANAGERS | {'dispatch', 'branch_dispatch', 'branch_manager', 'call_center_manager', 'call_center_agent', 'customer_service', 'sales', 'production', 'head_chef'}
CARE = MANAGERS | {'call_center_manager', 'call_center_agent', 'customer_service', 'sales'}
MARKETING = MANAGERS | {'marketing_manager', 'content_manager'}

def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value

class DiscoveryPreference(Base):
    __tablename__ = 'discovery_preferences'
    customer_id: Mapped[str] = mapped_column(ForeignKey('customers.id'), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

class FulfilmentSlot(Base):
    __tablename__ = 'fulfilment_slots'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    fulfilment: Mapped[str] = mapped_column(String(12))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    cutoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int] = mapped_column(Integer)
    occupied: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (CheckConstraint('occupied >= 0 AND capacity >= occupied'),)

class SlotReservation(Base):
    __tablename__ = 'fulfilment_slot_reservations'
    order_id: Mapped[int] = mapped_column(ForeignKey('app_orders.id'), primary_key=True)
    slot_id: Mapped[str] = mapped_column(ForeignKey('fulfilment_slots.id'), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class SlotWaitlist(Base):
    __tablename__ = 'fulfilment_slot_waitlist'
    slot_id: Mapped[str] = mapped_column(ForeignKey('fulfilment_slots.id'), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey('customers.id'), primary_key=True)
    state: Mapped[str] = mapped_column(String(16), default='waiting')
    revision: Mapped[int] = mapped_column(Integer, default=1)

def notify_slot_waitlist(db, slot_id):
    slot = db.get(FulfilmentSlot, slot_id)
    # UPDATE callers may hold an older ORM instance.
    if slot: db.refresh(slot)
    if not slot or not slot.enabled or slot.occupied >= slot.capacity or utc(slot.cutoff_at) <= datetime.now(UTC): return
    from .notifications import enqueue
    rows = list(db.scalars(select(SlotWaitlist).where(SlotWaitlist.slot_id == slot_id, SlotWaitlist.state == 'waiting').limit(500)))
    for row in rows:
        revision = row.revision
        changed = db.execute(update(SlotWaitlist).where(SlotWaitlist.slot_id == slot_id, SlotWaitlist.customer_id == row.customer_id,
            SlotWaitlist.state == 'waiting', SlotWaitlist.revision == revision).values(state='notified', revision=revision+1))
        if changed.rowcount == 1:
            enqueue(db, row.customer_id, f'slot-open:{slot_id}:{row.customer_id}:{revision}', 'slot_available',
                'A time window has opened', f'{slot.label} has space again. Check availability at checkout; your place is not reserved.', {'url':'/checkout'})

class WaitlistInput(BaseModel):
    enabled: bool

@router.put('/slots/{identity}/waitlist')
def waitlist(identity: str, data: WaitlistInput, actor=Depends(member), db: Session=Depends(get_db)):
    permit(actor, {'customer','corporate_client'})
    slot = db.get(FulfilmentSlot, identity)
    if not slot or not slot.enabled: raise HTTPException(404, 'Time window not found.')
    db.execute(update(FulfilmentSlot).where(FulfilmentSlot.id==identity).values(capacity=FulfilmentSlot.capacity))
    db.refresh(slot)
    row = db.get(SlotWaitlist, (identity, actor.id))
    if data.enabled:
        if utc(slot.cutoff_at) <= datetime.now(UTC): raise HTTPException(409, 'Booking has closed for this window.')
        if slot.occupied < slot.capacity: raise HTTPException(409, 'This window has space. Select it at checkout instead.')
        if not row:
            row=SlotWaitlist(slot_id=identity,customer_id=actor.id,state='waiting');db.add(row)
        elif row.state != 'waiting': row.state='waiting';row.revision+=1
    elif row: row.state='cancelled';row.revision+=1
    db.commit()
    return {'state':row.state if row else 'cancelled'}

class CareCase(Base):
    __tablename__ = 'customer_care_followups'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey('app_orders.id'), index=True, unique=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey('customers.id'), nullable=True)
    state: Mapped[str] = mapped_column(String(24), default='open')
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

class CompanyFavourite(Base):
    __tablename__='company_favourite_quotes'
    company_id: Mapped[str]=mapped_column(ForeignKey('organizations.id'),primary_key=True)
    document_id: Mapped[str]=mapped_column(ForeignKey('corporate_documents.id'),primary_key=True)

@router.get('/companies/{identity}/favourites')
def company_favourites(identity:str,actor=Depends(member),db:Session=Depends(get_db)):
    from .business import access,document_view
    from .ecosystem_models import CorporateDocument
    access(db,actor,identity)
    return [document_view(db.get(CorporateDocument,row.document_id)) for row in db.scalars(select(CompanyFavourite).where(CompanyFavourite.company_id==identity).limit(30))]

class FavouriteInput(BaseModel): enabled:bool

@router.put('/companies/{identity}/favourites/{document_id}')
def company_favourite(identity:str,document_id:str,data:FavouriteInput,actor=Depends(member),db:Session=Depends(get_db)):
    from .business import access,linked_document,lock
    access(db,actor,identity,write=True);lock(db,identity)
    linked_document(db,identity,document_id,'quote')
    row=db.get(CompanyFavourite,(identity,document_id))
    if data.enabled and not row:
        if db.scalar(select(func.count()).select_from(CompanyFavourite).where(CompanyFavourite.company_id==identity))>=30:
            raise HTTPException(409,'Keep up to 30 company favourites.')
        db.add(CompanyFavourite(company_id=identity,document_id=document_id))
    elif not data.enabled and row: db.delete(row)
    audit(db,actor.id,'corporate.favourite_changed',document_id,identity,enabled=data.enabled)
    db.commit();return {'enabled':data.enabled}

def permit(actor, roles):
    if actor.role not in roles:
        raise HTTPException(403, 'This workspace is not available to your role.')

def owned(db, actor, reference):
    row = db.scalar(select(AppOrder).where(AppOrder.reference == reference, AppOrder.customer_id == actor.id))
    if not row:
        raise HTTPException(404, 'Order not found')
    return row

class Preferences(BaseModel):
    model_config = ConfigDict(extra='forbid')
    flavours: list[str] = Field(default_factory=list, max_length=6)
    budget_minor: int | None = Field(default=None, ge=100, le=100000000)
    personalised: bool = True

@router.get('/preferences')
def preferences(actor=Depends(member), db: Session = Depends(get_db)):
    row = db.get(DiscoveryPreference, actor.id)
    return Preferences.model_validate(row.payload if row else {}).model_dump()

@router.put('/preferences')
def save_preferences(data: Preferences, actor=Depends(member), db: Session = Depends(get_db)):
    values = list(dict.fromkeys(v.strip().lower() for v in data.flavours if v.strip()))
    if any(len(v) > 40 for v in values):
        raise HTTPException(422, 'Flavour names must be 40 characters or fewer.')
    row = db.get(DiscoveryPreference, actor.id)
    if not row:
        row = DiscoveryPreference(customer_id=actor.id); db.add(row)
    row.payload = {**data.model_dump(), 'flavours': values}
    db.commit()
    return row.payload

def recent_orders(db, identity):
    return list(db.scalars(select(AppOrder).where(AppOrder.customer_id == identity,
        AppOrder.payment_state == 'completed', AppOrder.state.notin_(['cancelled','payment_failed']))
        .order_by(AppOrder.created_at.desc()).limit(30)))

@router.get('/home')
def home(response: Response, actor=Depends(member), db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'private, no-store'
    prefs = preferences(actor, db)
    from .app_catalogue import product_view
    from .product_rules import whole_cake, has_image
    rows = list(db.scalars(select(AppProduct).where(AppProduct.parent_id.is_(None), AppProduct.enabled.is_(True)).order_by(AppProduct.price_minor, AppProduct.id).limit(500)))
    rows = [p for p in rows if whole_cake(p) and has_image(p) and p.price_minor and (p.payload.get('order_mode') == 'made_to_order' or p.payload.get('type') == 'variable' or p.allocation-p.reserved-p.sold > 0)]
    if prefs['personalised']:
        if prefs['budget_minor']:
            rows = [p for p in rows if p.price_minor <= prefs['budget_minor']]
        if prefs['flavours']:
            import re
            rows = [p for p in rows if any(re.search(r'\b'+re.escape(f)+r'\b', str(p.payload.get('name','')), re.I) for f in prefs['flavours'])]
    orders = recent_orders(db, actor.id)
    summaries = [{'reference': o.reference, 'created_at': o.created_at, 'title': ', '.join(l.get('name','Cake') for l in o.snapshot.get('lines',[])[:2]), 'items': len(o.snapshot.get('lines',[]))} for o in orders[:3]]
    return {'preferences': prefs, 'usual': summaries, 'products': [product_view(p) for p in rows[:6]], 'reason': 'Your selected flavours and budget' if prefs['personalised'] and (prefs['flavours'] or prefs['budget_minor']) else 'Whole cakes, starting with lower prices'}

@router.post('/orders/{reference}/reorder')
def reorder(reference: str, actor=Depends(member), db: Session = Depends(get_db)):
    order = owned(db, actor, reference)
    from .product_rules import has_image
    from .app_catalogue import own_media
    proposal = []
    quantities = {}
    for line in order.snapshot.get('lines', []):
        product = db.get(AppProduct, line.get('product_id'))
        if not product or not has_image(product):
            raise HTTPException(409, 'An item is no longer published. Choose a new cake from Shop.')
        sku = db.get(AppProduct,line.get('sku_id',line['product_id']))
        if not product.enabled or not sku or not sku.enabled or sku.price_minor is None or (sku.id!=product.id and sku.parent_id!=product.id) or (sku.id==product.id and product.payload.get('type')=='variable'):
            raise HTTPException(409,'A previous selection is no longer sold. Choose current options in Shop.')
        quantities[sku.id]=quantities.get(sku.id,0)+line['quantity']
        if quantities[sku.id]>20 or (sku.payload.get('order_mode')!='made_to_order' and quantities[sku.id]>sku.allocation-sku.reserved-sku.sold):
            raise HTTPException(409,'There is not enough stock to repeat this order.')
        if product.payload.get('payment_test') or sku.payload.get('payment_test'):
            raise HTTPException(409,'Choose a current shop product.')
        images=own_media(product.payload.get('images',[]))
        selection={**{k:v for k,v in line.get('selection',{}).items() if v is not None},'message':'','add_ons':[]}
        selection.pop('studio_quote_id',None)
        proposal.append({'key':'','product_id':product.id,'slug':product.slug,'name':product.payload.get('name',product.slug),
            'image':images[0].get('src') if images else None,'price':sku.price_minor/100,'quantity':line['quantity'],'selection':selection})
    if not proposal: raise HTTPException(409,'This order has no repeatable items.')
    # A fresh occasion needs an explicit message/design review; never copy recipient details.
    return {'lines': proposal, 'notice': 'Current prices and availability. Review your message, design and delivery details before ordering.'}

def slot_view(slot):
    return {'id': slot.id, 'label': slot.label, 'fulfilment': slot.fulfilment, 'starts_at': slot.starts_at,
        'ends_at': slot.ends_at, 'cutoff_at': slot.cutoff_at, 'remaining': max(0, slot.capacity-slot.occupied),
        'capacity': slot.capacity, 'enabled': slot.enabled, 'revision': slot.revision,
        'full': slot.occupied >= slot.capacity, 'booking_closed':utc(slot.cutoff_at)<=datetime.now(UTC)}

@router.get('/slots')
def slots(fulfilment: Literal['pickup','delivery']='delivery', actor=Depends(member), db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    return [{**slot_view(s), 'waitlist_status': (r.state if (r := db.get(SlotWaitlist,(s.id,actor.id))) else None)} for s in db.scalars(select(FulfilmentSlot).where(FulfilmentSlot.fulfilment == fulfilment,
        FulfilmentSlot.enabled.is_(True), FulfilmentSlot.ends_at > now)
        .order_by(FulfilmentSlot.starts_at).limit(60))]

class SlotInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    label: str = Field(min_length=3, max_length=100)
    fulfilment: Literal['pickup','delivery']
    starts_at: datetime
    ends_at: datetime
    cutoff_at: datetime
    capacity: int = Field(ge=1, le=10000)
    enabled: bool = True
    revision: int = Field(default=0, ge=0)

@router.get('/staff/slots')
def staff_slots(actor=Depends(member), db: Session = Depends(get_db)):
    permit(actor, SLOT_STAFF)
    return [slot_view(s) for s in db.scalars(select(FulfilmentSlot).where(FulfilmentSlot.ends_at > datetime.now(UTC)).order_by(FulfilmentSlot.starts_at).limit(100))]

@router.put('/staff/slots/{identity}')
def save_slot(identity: str, data: SlotInput, actor=Depends(member), db: Session = Depends(get_db)):
    permit(actor, SLOT_STAFF)
    if len(identity) > 36 or not all(d.tzinfo for d in [data.starts_at,data.ends_at,data.cutoff_at]) or not datetime.now(UTC) < data.cutoff_at <= data.starts_at < data.ends_at:
        raise HTTPException(422, 'Use future times with timezone: cutoff, start, then end.')
    row = db.get(FulfilmentSlot, identity)
    if row:
        if row.occupied and data.capacity > row.capacity:
            raise HTTPException(403,'Only the Dispatch Manager can add capacity to a booked slot, using Override with a recorded reason.')
        if row.revision != data.revision or data.capacity < row.occupied:
            raise HTTPException(409, 'Capacity or revision changed. Reload this slot.')
        if row.occupied and any(getattr(row,k) != v for k,v in [('label',data.label),('fulfilment',data.fulfilment)]):
            raise HTTPException(409, 'A booked slot cannot change its identity.')
        if row.occupied and any(utc(getattr(row,k)) != getattr(data,k) for k in ['starts_at','ends_at','cutoff_at']):
            raise HTTPException(409, 'A booked slot cannot change its promised time.')
        result = db.execute(update(FulfilmentSlot).where(FulfilmentSlot.id==identity, FulfilmentSlot.revision==data.revision,
            FulfilmentSlot.occupied<=data.capacity).values(**data.model_dump(exclude={'revision'}),revision=data.revision+1))
        if result.rowcount != 1: raise HTTPException(409,'Slot changed. Reload before saving.')
        db.expire(row)
    else:
        if data.revision: raise HTTPException(409, 'Slot no longer exists.')
        row = FulfilmentSlot(id=identity, **data.model_dump(exclude={'revision'}), occupied=0, revision=1); db.add(row)
    audit(db, actor.id, 'fulfilment.slot_updated', identity)
    db.flush()
    notify_slot_waitlist(db, identity)
    db.commit()
    return slot_view(row)

class SlotOverride(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    revision:int=Field(ge=1)
    extra_places:int=Field(ge=1,le=100)
    reason:str=Field(min_length=10,max_length=1000)

@router.post('/staff/slots/{identity}/override')
def override_slot(identity:str,data:SlotOverride,actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,DISPATCH_MANAGERS)
    row=db.get(FulfilmentSlot,identity)
    if not row:raise HTTPException(404,'Window not found.')
    if not row.enabled or utc(row.cutoff_at)<=datetime.now(UTC):raise HTTPException(409,'This window is closed for bookings.')
    previous=row.capacity
    result=db.execute(update(FulfilmentSlot).where(FulfilmentSlot.id==identity,FulfilmentSlot.revision==data.revision,
        FulfilmentSlot.capacity+data.extra_places<=10000).values(capacity=FulfilmentSlot.capacity+data.extra_places,revision=FulfilmentSlot.revision+1))
    if result.rowcount!=1:raise HTTPException(409,'Window changed. Reload before overriding.')
    audit(db,actor.id,'fulfilment.slot_override',identity,reason=data.reason,extra_places=data.extra_places,previous_capacity=previous,fulfilment=row.fulfilment)
    notify_slot_waitlist(db, identity)
    db.commit();db.refresh(row)
    return slot_view(row)

def validate_slot(db, data):
    if not data.delivery_slot_id:
        if db.scalar(select(FulfilmentSlot.id).where(FulfilmentSlot.enabled.is_(True),FulfilmentSlot.fulfilment==data.fulfilment,FulfilmentSlot.ends_at>datetime.now(UTC)).limit(1)):
            raise HTTPException(409,'Choose an available time slot. If every window is full, contact Dispatch to arrange another time.')
        return
    row = db.get(FulfilmentSlot, data.delivery_slot_id)
    if not row or not row.enabled or row.fulfilment != data.fulfilment or utc(row.cutoff_at) <= datetime.now(UTC) or row.occupied >= row.capacity:
        raise HTTPException(409, 'This time slot is no longer available. Choose another time.')
    return {'id':row.id,'label':row.label,'starts_at':utc(row.starts_at).isoformat(),'ends_at':utc(row.ends_at).isoformat(),'revision':row.revision}

def reserve_slot(db, order):
    identity = order.snapshot.get('checkout',{}).get('delivery_slot_id')
    if not identity: return
    result = db.execute(update(FulfilmentSlot).where(FulfilmentSlot.id==identity, FulfilmentSlot.enabled.is_(True),
        FulfilmentSlot.revision==order.snapshot['fulfilment_window']['revision'],
        FulfilmentSlot.cutoff_at>datetime.now(UTC), FulfilmentSlot.occupied<FulfilmentSlot.capacity).values(occupied=FulfilmentSlot.occupied+1))
    if result.rowcount != 1: raise HTTPException(409, 'The last place in this slot was booked. Choose another time.')
    db.add(SlotReservation(order_id=order.id, slot_id=identity, active=True))

def release_slot(db, order):
    row = db.get(SlotReservation,order.id)
    if not row: return
    claimed = db.execute(update(SlotReservation).where(SlotReservation.order_id==order.id,SlotReservation.active.is_(True)).values(active=False))
    if claimed.rowcount:
        db.execute(update(FulfilmentSlot).where(FulfilmentSlot.id==row.slot_id,FulfilmentSlot.occupied>0).values(occupied=FulfilmentSlot.occupied-1))
        notify_slot_waitlist(db, row.slot_id)

def open_care(db, order, feedback):
    if feedback['rating'] > 2 and feedback['condition']=='good' and feedback['timing']!='late': return
    if db.scalar(select(CareCase.id).where(CareCase.order_id==order.id)): return
    from .service_desk import DeskCase
    existing = db.get(DeskCase, 'order:'+order.reference)
    assigned = existing.agent_id if existing else db.scalar(select(Customer.id).where(Customer.role.in_(['call_center_manager','call_center_agent','customer_service'])).order_by(Customer.id).limit(1))
    row = CareCase(id=str(uuid4()),order_id=order.id,agent_id=assigned,state='open',due_at=datetime.now(UTC)+timedelta(hours=24),payload={'feedback':feedback,'reply':'','history':[]})
    db.add(row)
    from .notifications import enqueue
    enqueue(db,order.customer_id,'care:'+order.reference,'customer_care','We are following up','Your feedback has reached our customer-care team.',{'reference':order.reference},remote=not order.snapshot.get('review_checkout',False))

def care_view(db, row, private=False):
    order = db.get(AppOrder,row.order_id)
    return {'id':row.id,'reference':order.reference,'state':row.state,'due_at':row.due_at,'reply':row.payload.get('reply',''),
        **({'agent_id':row.agent_id,'revision':row.revision,'feedback':row.payload.get('feedback',{}),'history':row.payload.get('history',[])} if private else {})}

@router.get('/care')
def my_care(actor=Depends(member), db: Session = Depends(get_db)):
    rows = db.scalars(select(CareCase).join(AppOrder,AppOrder.id==CareCase.order_id).where(AppOrder.customer_id==actor.id).order_by(CareCase.due_at.desc()).limit(30))
    return [care_view(db,r) for r in rows]

@router.get('/staff/care')
def staff_care(actor=Depends(member), db: Session = Depends(get_db)):
    permit(actor,CARE)
    query=select(CareCase).where(CareCase.state!='resolved').order_by(CareCase.due_at)
    if actor.role not in MANAGERS|{'call_center_manager'}: query=query.where((CareCase.agent_id==actor.id)|(CareCase.agent_id.is_(None)))
    return [care_view(db,r,True) for r in db.scalars(query.limit(100))]

class CareUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=1)
    state: Literal['open','contacted','resolved']
    reply: str = Field(min_length=3,max_length=1500)

@router.put('/staff/care/{identity}')
def update_care(identity:str,data:CareUpdate,actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,CARE)
    row=db.get(CareCase,identity)
    if not row: raise HTTPException(404,'Case not found')
    if row.agent_id and row.agent_id!=actor.id and actor.role not in MANAGERS|{'call_center_manager'}: raise HTTPException(403,'This case belongs to another agent.')
    if row.state=='resolved': raise HTTPException(409,'This case is already resolved.')
    history=[*row.payload.get('history',[]),{'state':data.state,'at':datetime.now(UTC).isoformat(),'actor':actor.id,'reply':data.reply.strip()}]
    result=db.execute(update(CareCase).where(CareCase.id==identity,CareCase.revision==data.revision).values(state=data.state,agent_id=row.agent_id or actor.id,revision=data.revision+1,payload={**row.payload,'reply':data.reply.strip(),'history':history}))
    if result.rowcount!=1: raise HTTPException(409,'Another agent updated this case. Reload it.')
    from .notifications import enqueue
    order=db.get(AppOrder,row.order_id)
    enqueue(db,order.customer_id,f'care:{identity}:{data.revision+1}','customer_care','Your care request has an update',data.reply.strip(),{'reference':order.reference},remote=not order.snapshot.get('review_checkout',False))
    audit(db,actor.id,'care.'+data.state,order.reference)
    db.commit();db.refresh(row)
    return care_view(db,row,True)

@router.get('/staff/promotion-results')
def promotion_results(actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,MARKETING)
    from .promotions import rules
    result=[]
    for coupon in db.scalars(select(AppCoupon).where(AppCoupon.customer_id.is_(None)).order_by(AppCoupon.code).limit(100)):
        orders=list(db.scalars(select(AppOrder).where(AppOrder.coupon_code==coupon.code,AppOrder.payment_state=='completed')))
        live=[o for o in orders if o.channel=='app' and o.environment=='live' and not o.snapshot.get('review_checkout')]
        refs=[o.reference for o in live]
        net=sum(db.scalars(select(SalesRecord.paid_minor-SalesRecord.reversed_minor).where(SalesRecord.channel=='app',SalesRecord.environment=='live',SalesRecord.currency=='KES',SalesRecord.reference.in_(refs)))) if refs else 0
        buyers={o.customer_id for o in live}
        first=repeat=0
        for identity in buyers:
            first_order=min((o for o in live if o.customer_id==identity),key=lambda o:(utc(o.created_at),o.id))
            # Compare actual stored timestamps and break second-resolution ties by ID.
            first_promo=first_order.created_at
            prior=db.scalar(select(AppOrder.id).where(AppOrder.customer_id==identity,AppOrder.id!=first_order.id,AppOrder.payment_state=='completed',AppOrder.channel=='app',AppOrder.environment=='live',
                ((AppOrder.created_at<first_promo)|((AppOrder.created_at==first_promo)&(AppOrder.id<first_order.id)))).limit(1))
            if prior: repeat+=1
            else: first+=1
        result.append({'code':coupon.code,'title':rules(db,coupon.code).get('title',coupon.code),'orders':len(live),'first_buyers':first,'repeat_buyers':repeat,'net_collected_minor':net,'discount_minor':sum(o.discount_minor for o in live),'review_orders':len(orders)-len(live)})
    return {'items':result,'definition':'App coupon-attributed orders only; not proof of causal lift. Net verified KES collections include reversals. Review orders are separate.'}

@router.get('/staff/exceptions')
def exceptions(actor=Depends(member),db:Session=Depends(get_db)):
    permit(actor,OPERATORS)
    from .logistics_models import ProductionTask,LogisticsTask,LogisticsEvent
    from .logistics import require_plant
    now=datetime.now(UTC);items=[]
    # Explicit workload thresholds are operational alerts, never customer arrival promises.
    for order in db.scalars(select(AppOrder).where(AppOrder.payment_state=='completed',AppOrder.state.notin_(['completed','cancelled','payment_failed'])).order_by(AppOrder.created_at).limit(500)):
        production=db.get(ProductionTask,order.id)
        if actor.role not in MANAGERS|{'call_center_manager'}:
            if actor.role in {'call_center_agent','customer_service','sales'}:
                from .service_desk import DeskCase
                case=db.get(DeskCase,'order:'+order.reference)
                if not case or case.agent_id!=actor.id: continue
            else:
                try: require_plant(db,actor,production.plant if production else 'hq')
                except HTTPException: continue
        age=(now-utc(order.paid_at or order.created_at)).total_seconds()/60
        if not production and age>=15: items.append({'reference':order.reference,'kind':'unassigned_kitchen','label':'Kitchen assignment waiting','minutes':int(age)})
        task=db.scalar(select(LogisticsTask).where(LogisticsTask.order_id==order.id,LogisticsTask.service_type=='delivery',LogisticsTask.status!='cancelled').order_by(LogisticsTask.created_at.desc()))
        if order.state=='ready' and (not task or not task.rider_id): items.append({'reference':order.reference,'kind':'unassigned_delivery','label':'Ready; rider assignment needed','minutes':int(age)})
        if task and task.status in ['collected','in_transit','accepted']:
            last=db.scalar(select(LogisticsEvent).where(LogisticsEvent.task_id==task.id).order_by(LogisticsEvent.created_at.desc()))
            idle=(now-utc(last.created_at if last else task.created_at)).total_seconds()/60
            if idle>=60: items.append({'reference':order.reference,'kind':'rider_stalled','label':'No trip update for an hour','minutes':int(idle)})
        booked=db.get(SlotReservation,order.id)
        slot=db.get(FulfilmentSlot,booked.slot_id) if booked and booked.active else None
        if slot and utc(slot.ends_at)<now: items.append({'reference':order.reference,'kind':'slot_overdue','label':'Booked fulfilment window passed','minutes':int((now-utc(slot.ends_at)).total_seconds()/60)})
    if actor.role in CARE:
        for case in db.scalars(select(CareCase).where(CareCase.state!='resolved',CareCase.due_at<now).limit(100)):
            if actor.role not in MANAGERS|{'call_center_manager'} and case.agent_id!=actor.id: continue
            order=db.get(AppOrder,case.order_id)
            items.append({'reference':order.reference,'kind':'care_overdue','label':'Customer-care response overdue','minutes':int((now-utc(case.due_at)).total_seconds()/60)})
    return {'items':items[:100],'thresholds':{'kitchen_assignment_minutes':15,'trip_update_minutes':60,'care_response_hours':24}}

@router.get('/orders/{reference}/gift-note',response_class=HTMLResponse)
def gift_note(reference:str,actor=Depends(member),db:Session=Depends(get_db)):
    from html import escape
    order=owned(db,actor,reference)
    data=order.snapshot.get('checkout',{})
    import base64
    from pathlib import Path
    logo='data:image/png;base64,'+base64.b64encode((Path(__file__).parent/'dashboard'/'cake-city-logo.png').read_bytes()).decode()
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Your celebration</title></head><body style="font-family:Arial;padding:36px;max-width:560px;margin:auto;color:#3b1830"><img style="width:130px" alt="Cake City" src="'+logo+'"><h1>A little happiness, just for you.</h1><h2>'+escape(data.get('recipient_name') or 'Enjoy your celebration')+'</h2><p>'+escape(data.get('gift_message') or 'Made with love. Enjoy every moment.')+'</p><hr><p>'+escape(', '.join(l.get('name','Cake') for l in order.snapshot.get('lines',[])))+'</p><small>'+escape(order.reference)+'</small></body></html>'
