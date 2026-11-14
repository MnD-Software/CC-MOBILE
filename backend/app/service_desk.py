"""Agent ownership and handoffs around the existing order and enquiry records."""
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4
from html import escape
import base64
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import or_, ForeignKey, Integer, JSON, String, select, update
from sqlalchemy.orm import Mapped, mapped_column, Session
from .db import Base, get_db
from .models import Customer, Enquiry
from .commerce_models import AppOrder, SalesRecord
from .routes_club import member
from .permissions import audit
from .logistics import MANAGERS, KITCHEN, DISPATCH, require_plant
from .logistics_models import ProductionTask
from .app_commerce import tracked_order_view
from .excel_report import workbook_response

router=APIRouter(prefix='/v1/service-desk',tags=['call-centre'])
AGENTS={'call_center_agent','call_center_manager','customer_service','sales'}
LEADS=MANAGERS|{'call_center_manager'}


class DeskCase(Base):
    __tablename__='service_desk_cases'
    key: Mapped[str]=mapped_column(String(140),primary_key=True)
    agent_id: Mapped[str]=mapped_column(ForeignKey('customers.id'),index=True)
    revision: Mapped[int]=mapped_column(Integer,default=1)
    payload: Mapped[dict]=mapped_column(JSON,default=dict)


def agent(actor=Depends(member)):
    if actor.role not in AGENTS|LEADS: raise HTTPException(403,'Call centre access required')
    return actor


def resource(db,kind,identity):
    row=db.scalar(select(AppOrder).where(AppOrder.reference==identity)) if kind=='order' else db.get(Enquiry,identity)
    if not row: raise HTTPException(404,'Record not found')
    return row


def desk_view(db,kind,row):
    identity=row.reference if kind=='order' else row.id
    case=db.get(DeskCase,kind+':'+identity)
    owner=db.get(Customer,case.agent_id) if case else None
    return {'kind':kind,'identity':identity,'title':identity if kind=='order' else row.subject,
        'status':row.state if kind=='order' else row.status,'created_at':row.created_at,
        'agent_id':case.agent_id if case else None,'agent_name':f'{owner.first_name} {owner.last_name}'.strip() if owner else None,
        'revision':case.revision if case else 0,'priority':case.payload.get('priority','normal') if case else 'normal',
        'follow_up_at':case.payload.get('follow_up_at') if case else None,
        'order_value_minor':row.total_minor if kind=='order' else None}


def access(db,actor,kind,identity):
    row=resource(db,kind,identity)
    case=db.get(DeskCase,kind+':'+identity)
    if actor.role in LEADS or (actor.role in AGENTS and case and case.agent_id==actor.id): return row,case
    if kind=='order' and actor.role in KITCHEN|DISPATCH:
        production=db.get(ProductionTask,row.id)
        require_plant(db,actor,production.plant if production else 'hq')
        return row,case
    raise HTTPException(403,'Claim this record first, or ask the assigned agent or manager.')


@router.get('/agents')
def agents(actor=Depends(agent),db:Session=Depends(get_db)):
    if actor.role not in LEADS: return [{'id':actor.id,'name':f"{getattr(actor,'first_name','Agent')} {getattr(actor,'last_name','')}".strip()}]
    return [{'id':p.id,'name':f'{p.first_name} {p.last_name}'.strip()} for p in db.scalars(select(Customer).where(Customer.role.in_(AGENTS|LEADS)))]


@router.get('/records')
def queue(kind:Literal['order','enquiry']='order',scope:Literal['mine','unassigned','all']='mine',
          search:str=Query(default='',max_length=100),page:int=Query(default=1,ge=1),
          actor=Depends(agent),db:Session=Depends(get_db)):
    query=select(AppOrder).order_by(AppOrder.created_at.desc()) if kind=='order' else select(Enquiry).order_by(Enquiry.created_at.desc())
    # Join before pagination so agents never need to scan the full customer database.
    column=AppOrder.reference if kind=='order' else Enquiry.id
    query=query.outerjoin(DeskCase,DeskCase.key==kind+':'+column)
    if scope=='mine': query=query.where(DeskCase.agent_id==actor.id)
    elif scope=='unassigned': query=query.where(DeskCase.key.is_(None))
    elif actor.role not in LEADS: query=query.where((DeskCase.agent_id==actor.id)|(DeskCase.key.is_(None)))
    if search.strip():
        field=AppOrder.reference if kind=='order' else Enquiry.subject
        owner_id=AppOrder.customer_id if kind=='order' else Enquiry.customer_id
        query=query.join(Customer,Customer.id==owner_id)
        term=search.strip()
        matches=[field.icontains(term,autoescape=True),Customer.email.icontains(term,autoescape=True),Customer.phone.icontains(term,autoescape=True),Customer.first_name.icontains(term,autoescape=True),Customer.last_name.icontains(term,autoescape=True)]
        if kind=='order':
            for contact in ['email','phone','first_name','last_name']:
                matches.append(AppOrder.snapshot['checkout']['billing'][contact].as_string().icontains(term,autoescape=True))
        query=query.where(or_(*matches))
    rows=list(db.scalars(query.offset((page-1)*30).limit(31)))
    return {'items':[desk_view(db,kind,r) for r in rows[:30]],'page':page,'has_more':len(rows)>30}


class UpdateCase(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    revision:int=Field(ge=0)
    agent_id:str|None=Field(default=None,max_length=36)
    priority:Literal['normal','urgent']='normal'
    follow_up_at:datetime|None=None
    handoff:Literal['agent','kitchen','dispatch']='agent'
    note:str=Field(default='',max_length=2000)


@router.put('/records/{kind}/{identity}')
def save(kind:Literal['order','enquiry'],identity:str,data:UpdateCase,actor=Depends(agent),db:Session=Depends(get_db)):
    row=resource(db,kind,identity)
    # Serialize assignments without changing the order/enquiry's operational state.
    model=AppOrder if kind=='order' else Enquiry
    db.execute(update(model).where(model.id==row.id).values(customer_id=model.customer_id))
    case=db.get(DeskCase,kind+':'+identity)
    if (case.revision if case else 0)!=data.revision: raise HTTPException(409,'Another agent updated this record. Refresh this card.')
    if case and actor.role not in LEADS and case.agent_id!=actor.id: raise HTTPException(403,'This record belongs to another agent')
    assigned=data.agent_id or (case.agent_id if case else actor.id)
    if assigned!=actor.id and actor.role not in LEADS: raise HTTPException(403,'Only a call centre manager can reassign agents')
    person=db.get(Customer,assigned)
    if not person or person.role not in AGENTS|LEADS: raise HTTPException(422,'Choose a call centre agent')
    if data.follow_up_at and (not data.follow_up_at.tzinfo or data.follow_up_at<=datetime.now(UTC)): raise HTTPException(422,'Choose a future follow-up time with timezone')
    if data.handoff!='agent' and (kind!='order' or len(data.note)<3): raise HTTPException(422,'Department handoff requires an order and a meaningful note')
    if not case:
        case=DeskCase(key=kind+':'+identity,agent_id=assigned,revision=0,payload={})
        db.add(case)
    notes=list(case.payload.get('notes',[]))
    if data.note:
        notes.append({'id':str(uuid4()),'actor_id':actor.id,'actor':f"{getattr(actor,'first_name','Agent')} {getattr(actor,'last_name','')}".strip(),
                      'at':datetime.now(UTC).isoformat(),'department':data.handoff,'note':data.note})
    case.agent_id=assigned
    case.revision+=1
    case.payload={'priority':data.priority,'follow_up_at':data.follow_up_at.isoformat() if data.follow_up_at else None,'notes':notes[-100:]}
    audit(db,actor.id,'service_desk.updated',identity,kind=kind,assigned_to=assigned,handoff=data.handoff,revision=case.revision)
    db.commit()
    return desk_view(db,kind,row)


@router.get('/records/{kind}/{identity}')
def detail(kind:Literal['order','enquiry'],identity:str,actor=Depends(member),db:Session=Depends(get_db)):
    row,case=access(db,actor,kind,identity)
    person=db.get(Customer,row.customer_id)
    result={**desk_view(db,kind,row),'customer':{'name':f'{person.first_name} {person.last_name}'.strip(),'phone':person.phone or '', 'email':person.email},
            'notes':case.payload.get('notes',[]) if case else []}
    if kind=='order':
        from .routes_enquiries import OrderSupportLink,output
        result['order']=tracked_order_view(db,row)
        result['checkout_contacts']=row.snapshot.get('checkout',{}).get('billing',{})
        result['recipient']={k:row.snapshot.get('checkout',{}).get(k,'') for k in ['recipient_name','recipient_phone']}
        production=db.get(ProductionTask,row.id)
        result['production']={'plant':production.plant,'assigned_to':production.assigned_to} if production else None
        result['enquiries']=[output(e) for e in db.scalars(select(Enquiry).join(OrderSupportLink,OrderSupportLink.enquiry_id==Enquiry.id).where(OrderSupportLink.order_id==row.id))]
    else:
        from .routes_enquiries import output,OrderSupportLink
        result['enquiry']=output(row)
        link=db.get(OrderSupportLink,row.id)
        result['order_reference']=db.get(AppOrder,link.order_id).reference if link else None
    return result


@router.get('/report.xlsx')
def report(actor=Depends(agent),db:Session=Depends(get_db)):
    query=select(DeskCase).where(DeskCase.key.startswith('order:'))
    if actor.role not in LEADS: query=query.where(DeskCase.agent_id==actor.id)
    rows=[]
    for case in db.scalars(query):
        order=db.scalar(select(AppOrder).where(AppOrder.reference==case.key[6:]))
        ledger=list(db.scalars(select(SalesRecord).where(SalesRecord.reference==order.reference,SalesRecord.environment==order.environment,SalesRecord.channel==order.channel)))
        collected=0 if order.snapshot.get('review_checkout') else sum(s.paid_minor-s.reversed_minor for s in ledger)
        rows.append([order.reference,case.agent_id,order.state,order.payment_state,order.total_minor/100,collected/100,
                     'Review' if order.snapshot.get('review_checkout') else order.environment,case.payload.get('priority','normal')])
    return workbook_response('agent-assisted-orders',['Order','Responsible agent','Order status','Payment status','Order value KES','Net collected KES','Environment','Priority'],rows)


@router.get('/orders/{reference}/receipt')
def receipt(reference:str,actor=Depends(member),db:Session=Depends(get_db)):
    order,_=access(db,actor,'order',reference)
    if order.payment_state!='completed': raise HTTPException(409,'A receipt requires confirmed payment. This order is still awaiting payment.')
    logo=base64.b64encode((Path(__file__).parent/'dashboard'/'cake-city-logo.png').read_bytes()).decode()
    cash=lambda n:f'KES {n/100:,.2f}'
    lines=''.join(f'<tr><td>{escape(str(l["name"]))}</td><td>{l["quantity"]}</td><td>{cash(l["line_minor"])}</td></tr>' for l in order.snapshot.get('lines',[]))
    collected=0 if order.snapshot.get('review_checkout') else order.total_minor
    html=f'<!doctype html><html><head><meta charset="utf-8"><title>Receipt {escape(reference)}</title><style>@page{{size:A4;margin:18mm}}body{{font:14px Arial;color:#382234;max-width:760px;margin:32px auto}}img{{width:140px}}h1{{color:#922663}}table{{width:100%;border-collapse:collapse}}td,th{{padding:14px;border-bottom:1px solid #eadfe5;text-align:left}}footer{{margin-top:40px;color:#6d6167}}.total{{padding:20px;background:#fff0f8}}</style></head><body><img alt="Cake City logo" src="data:image/png;base64,{logo}"><h1>Your celebration receipt</h1><p>{escape(reference)} · {escape(str(order.created_at))}</p><table><thead><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>{lines}</tbody></table><div class="total"><p>Savings {cash(order.discount_minor)} · Delivery {cash(order.delivery_minor)}</p><h2>Order value {cash(order.total_minor)}</h2><p>Collected {cash(collected)}</p></div><footer>App receipt. This document is not an eTIMS tax invoice.</footer></body></html>'
    return HTMLResponse(html,headers={'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'})
