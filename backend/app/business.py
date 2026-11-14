"""Staff-managed corporate CRM and client-scoped commercial documents."""
import base64
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from .db import get_db
from .models import Customer, Organization, OrganizationMember
from .commerce_models import AppProduct, AppPolicy
from .product_rules import has_image, cake_weight, whole_cake
from .ecosystem_models import CorporateAssignment, CorporateActivity, CorporateDocument, CorporateAttachment, CorporatePaymentReference
from sqlalchemy.exc import IntegrityError
from .routes_club import member
from .permissions import audit
from .security import hash_password
from .app_commerce import utc, digest
from .excel_report import workbook_response

router = APIRouter(prefix="/v1/business", tags=["corporate-portal"])
MANAGERS = {"admin", "staff", "ecommerce_manager", "corporate_manager"}
TEAM = MANAGERS | {"corporate_assistant", "corporate_agent", "corporate_sales"}
ONBOARD = MANAGERS | {"corporate_assistant", "corporate_sales"}


def access(db, person, identity, write=False):
    org = db.get(Organization, identity)
    if not org: raise HTTPException(404, "Company not found.")
    if person.role in MANAGERS: return org
    if person.role in TEAM:
        if not db.get(CorporateAssignment, (identity, person.id)): raise HTTPException(404, "Company not found.")
        return org
    membership = db.get(OrganizationMember, (identity, person.id))
    if not membership: raise HTTPException(404, "Company not found.")
    if write and membership.role == "viewer": raise HTTPException(403, "Your company access is read only.")
    return org


def lock(db, identity):
    db.execute(update(Organization).where(Organization.id == identity).values(name=Organization.name))


@router.get("/inventory")
def inventory(search: str = "", person=Depends(member), db: Session = Depends(get_db)):
    if len(search) > 100: raise HTTPException(422, "Search is too long.")
    query = select(AppProduct).where(AppProduct.enabled.is_(True), AppProduct.price_minor > 0)
    if search.strip(): query = query.where(AppProduct.payload["name"].as_string().icontains(search.strip(), autoescape=True))
    rows = []
    for p in db.scalars(query.order_by(AppProduct.price_minor, AppProduct.id)):
        if p.payload.get("type") == "variable" or p.payload.get("payment_test") or not has_image(db.get(AppProduct,p.parent_id) if p.parent_id else p): continue
        if p.payload.get("order_mode") != "made_to_order" and p.allocation-p.reserved-p.sold < 1: continue
        attributes = p.payload.get("variation_attributes", [])
        label = " / ".join(str(a.get("value", "")).replace("-", " ") for a in attributes if a.get("value"))
        rows.append({"id": p.id, "parent_id": p.parent_id, "name": p.payload.get("name", p.slug), "label": label,
                     "price_minor": p.price_minor, "image": next(iter(p.payload.get("images", [])), {}).get("src")})
        if len(rows) == 40: break
    return rows


@router.get("/companies")
def companies(person=Depends(member), db: Session = Depends(get_db)):
    query = select(Organization)
    if person.role not in MANAGERS:
        if person.role in TEAM:
            query = query.join(CorporateAssignment).where(CorporateAssignment.customer_id == person.id)
        else:
            query = query.join(OrganizationMember).where(OrganizationMember.customer_id == person.id)
    return [{"id": r.id, "name": r.name, "billing_address": r.billing_address, "industry": r.industry,
             "created_at": r.created_at} for r in db.scalars(query.order_by(Organization.name))]


class Onboard(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_key: str = Field(min_length=16, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    billing_address: str = Field(min_length=5, max_length=500)
    industry: str = Field(default="", max_length=100)
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=10, max_length=128)


@router.post("/companies", status_code=201)
def onboard(data: Onboard, person=Depends(member), db: Session = Depends(get_db)):
    if person.role not in ONBOARD: raise HTTPException(403, "Corporate manager or assistant access required.")
    db.execute(update(Customer).where(Customer.id == person.id).values(first_name=Customer.first_name))
    old = db.scalar(select(Organization).where(Organization.owner_id == person.id, Organization.request_key == data.request_key))
    email = str(data.email).lower()
    if old:
        contact = db.scalar(select(Customer).join(OrganizationMember).where(OrganizationMember.organization_id == old.id, Customer.email == email))
        if not contact or (old.name, old.billing_address, old.industry) != (data.name, data.billing_address, data.industry):
            raise HTTPException(409, "Request key already used for other company details.")
        return {"id": old.id, "name": old.name}
    contact = db.scalar(select(Customer).where(Customer.email == email))
    if contact and contact.role not in {"customer", "corporate_client"}:
        raise HTTPException(409, "A team account cannot become a corporate client.")
    if not contact:
        contact = Customer(id=str(uuid4()), email=email, first_name=data.first_name, last_name=data.last_name,
                           password_hash=hash_password(data.password), role="corporate_client")
        db.add(contact)
        db.flush()
    org = Organization(id=str(uuid4()), owner_id=person.id, request_key=data.request_key,
                       name=data.name, billing_address=data.billing_address, industry=data.industry)
    db.add(org)
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, customer_id=contact.id, role="owner"))
    db.add(CorporateAssignment(organization_id=org.id, customer_id=person.id, assigned_by=person.id))
    audit(db, person.id, "corporate.client_onboarded", org.id, org.id)
    db.commit()
    return {"id": org.id, "name": org.name, "existing_login_preserved": True}


class Assignment(BaseModel):
    customer_id: str = Field(min_length=1, max_length=36)


@router.get("/team")
def team(person=Depends(member), db: Session = Depends(get_db)):
    if person.role not in ONBOARD: raise HTTPException(403, "Corporate manager access required.")
    return [{"id": p.id, "name": f"{p.first_name} {p.last_name}", "role": p.role} for p in db.scalars(select(Customer).where(Customer.role.in_(TEAM)).order_by(Customer.first_name))]


@router.put("/companies/{identity}/assignments")
def assign(identity: str, data: Assignment, person=Depends(member), db: Session = Depends(get_db)):
    if person.role not in ONBOARD: raise HTTPException(403, "Corporate manager or assistant access required.")
    access(db, person, identity)
    target = db.get(Customer, data.customer_id)
    if not target or target.role not in TEAM: raise HTTPException(422, "Choose a corporate team account.")
    lock(db, identity)
    if not db.get(CorporateAssignment, (identity, target.id)):
        db.add(CorporateAssignment(organization_id=identity, customer_id=target.id, assigned_by=person.id))
        audit(db, person.id, "corporate.assignment_added", target.id, identity)
    db.commit()
    return {"status": "assigned"}


@router.get("/companies/{identity}")
def detail(identity: str, person=Depends(member), db: Session = Depends(get_db)):
    org = access(db, person, identity)
    staff = person.role in TEAM
    documents = list(db.scalars(select(CorporateDocument).where(CorporateDocument.organization_id == identity).order_by(CorporateDocument.created_at.desc())))
    visible = [d for d in documents if staff or d.status != "draft" or d.created_by == person.id]
    invoices = [d for d in documents if d.kind == "invoice" and d.status == "issued"]
    payments = [d for d in documents if d.kind == "payment" and d.status == "verified"]
    total = sum(d.total_minor for d in invoices)
    paid = sum(d.total_minor for d in payments)
    brand=db.get(AppPolicy,'cb:'+identity)
    return {"id": org.id, "name": org.name, "billing_address": org.billing_address, "branding":brand.payload if brand else {},
            "permissions": {"team": staff, "onboard": person.role in ONBOARD, "manage": person.role in MANAGERS},
            "totals": {"invoiced_minor": total, "paid_minor": paid, "balance_minor": total-paid},
            "documents": [{**document_view(d), "attachment_mime": db.get(CorporateAttachment,d.id).mime if db.get(CorporateAttachment,d.id) else None} for d in visible],
            "activities": [{"id": a.id, "actor": f"{p.first_name} {p.last_name}", "stage": a.stage,
                            "note": a.note, "follow_up_at": a.follow_up_at, "created_at": a.created_at}
                           for a,p in db.execute(select(CorporateActivity,Customer).join(Customer,CorporateActivity.actor_id==Customer.id)
                           .where(CorporateActivity.organization_id==identity).order_by(CorporateActivity.created_at.desc()))] if staff else []}


class Activity(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    stage: Literal["lead", "contacted", "qualified", "proposal", "won", "follow_up", "closed"]
    note: str = Field(min_length=3, max_length=3000)
    follow_up_at: datetime | None = None


@router.post("/companies/{identity}/activities", status_code=201)
def activity(identity: str, data: Activity, person=Depends(member), db: Session = Depends(get_db)):
    access(db, person, identity)
    if person.role not in TEAM: raise HTTPException(403, "CRM notes are for the corporate team.")
    if data.follow_up_at and data.follow_up_at.tzinfo is None: raise HTTPException(422, "Follow-up time needs a timezone.")
    record = CorporateActivity(id=str(uuid4()), organization_id=identity, actor_id=person.id, **data.model_dump())
    db.add(record)
    audit(db, person.id, "corporate.activity_added", record.id, identity, stage=data.stage)
    db.commit()
    return {"id": record.id}


class Line(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(strict=True, ge=1, le=10000)


class DocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_key: str = Field(min_length=16, max_length=80)
    kind: Literal["quote", "lpo", "invoice", "payment"]
    lines: list[Line] = Field(default_factory=list, max_length=100)
    linked_id: str | None = Field(default=None, max_length=36)
    reference: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=3000)
    amount_minor: int = Field(default=0, strict=True, ge=0, le=1000000000)
    valid_days: int = Field(default=14, ge=1, le=90)


def document_view(row):
    return {"id": row.id, "kind": row.kind, "status": row.status, "total_minor": row.total_minor,
            "revision": row.revision, "created_by": row.created_by, "created_at": row.created_at, **row.payload}


def linked_document(db, identity, link, kind):
    row = db.get(CorporateDocument, link) if link else None
    if not row or row.organization_id != identity or row.kind != kind:
        raise HTTPException(422, f"Choose this company's {kind}.")
    return row


@router.post("/companies/{identity}/documents", status_code=201)
def create_document(identity: str, data: DocumentInput, person=Depends(member), db: Session = Depends(get_db)):
    access(db, person, identity, write=True)
    lock(db, identity)
    fingerprint = digest(data.model_dump())
    old = db.scalar(select(CorporateDocument).where(CorporateDocument.organization_id == identity, CorporateDocument.request_key == data.request_key))
    if old:
        if old.payload.get("fingerprint") != fingerprint: raise HTTPException(409, "Document request already used with different details.")
        return document_view(old)
    staff = person.role in TEAM
    if data.kind == "invoice" and not staff: raise HTTPException(403, "Only your corporate team can issue invoices.")
    lines, total, status = [], 0, "draft"
    pricing = {}
    if data.kind == "quote":
        if not data.lines: raise HTTPException(422, "Add at least one inventory product.")
        for line in data.lines:
            product = db.get(AppProduct, line.product_id)
            if not product or not product.enabled or product.price_minor is None or product.payload.get("type") == "variable" or not has_image(db.get(AppProduct,product.parent_id) if product.parent_id else product):
                raise HTTPException(409, "Select a priced, available product or variation.")
            lines.append({"product_id": product.id, "name": product.payload.get("name", product.slug), "quantity": line.quantity,
                          "unit_minor": product.price_minor, "total_minor": product.price_minor*line.quantity})
        subtotal = sum(l["total_minor"] for l in lines)
        weight, eligible = 0, 0
        for line in lines:
            product=db.get(AppProduct,line['product_id'])
            parent=db.get(AppProduct,product.parent_id) if product.parent_id else product
            kg=cake_weight(product,parent)
            if whole_cake(parent) and kg is not None:
                weight += kg*line['quantity']
                eligible += line['total_minor']
        rate=1000 if weight>5 else 500 if weight>=2 else 0
        discount=eligible*rate//10000
        pricing={'subtotal_minor':subtotal,'discount_minor':discount,'discount_bps':rate,'cake_kg':round(weight,3),'discount_basis':'per_order'}
        total = subtotal-discount
        if total > 1000000000: raise HTTPException(422, "Quote exceeds the supported amount.")
        status = "issued" if staff else "requested"
    elif data.kind == "lpo":
        linked_document(db, identity, data.linked_id, "quote")
        if len(data.reference) < 3: raise HTTPException(422, "Enter the LPO reference.")
        status = "submitted"
    elif data.kind == "invoice":
        quote = linked_document(db, identity, data.linked_id, "quote")
        if quote.status != "accepted": raise HTTPException(409, "A client must accept this quotation before invoicing.")
        if db.scalar(select(CorporateDocument.id).where(CorporateDocument.organization_id == identity, CorporateDocument.kind == "invoice", CorporateDocument.payload["linked_id"].as_string() == quote.id)):
            raise HTTPException(409, "This accepted quote already has an invoice.")
        lines, total, status = quote.payload["lines"], quote.total_minor, "issued"
        pricing={k:quote.payload[k] for k in ("subtotal_minor","discount_minor","discount_bps","cake_kg","discount_basis") if k in quote.payload}
    elif data.kind == "payment":
        invoice = linked_document(db, identity, data.linked_id, "invoice")
        if data.amount_minor <= 0 or len(data.reference) < 3: raise HTTPException(422, "Enter the amount and payment reference.")
        if data.reference.startswith("APP-"):raise HTTPException(409,"App payment references are reconciled automatically; use the external payment reference for separate evidence.")
        total, status = data.amount_minor, "submitted"
        # Clients submit evidence; it never settles an invoice automatically.
        if total > invoice.total_minor: raise HTTPException(409, "Payment exceeds this invoice's amount.")
    row = CorporateDocument(id=str(uuid4()), organization_id=identity, created_by=person.id, request_key=data.request_key,
                            kind=data.kind, status=status, total_minor=total, payload={"fingerprint": fingerprint,
                            **pricing, "lines": lines, "linked_id": data.linked_id, "reference": data.reference, "notes": data.notes,
                            "expires_at": (datetime.now(UTC)+timedelta(days=data.valid_days)).isoformat() if data.kind == "quote" else None})
    db.add(row)
    if data.kind=='quote' and status=='issued':
        from .notifications import enqueue
        for customer_id in db.scalars(select(OrganizationMember.customer_id).where(OrganizationMember.organization_id==identity)):
            enqueue(db,customer_id,'corporate:'+row.id+':issued','corporate_quote','Your quotation is ready','Open your company portal to review your Cake City quotation.',{'url':'/corporate'})
    audit(db, person.id, "corporate.document_created", row.id, identity, kind=data.kind)
    db.commit()
    return document_view(row)


class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    status: Literal["issued", "accepted", "rejected", "verified", "recalled"]


@router.post("/companies/{identity}/documents/{document_id}/status")
def transition(identity: str, document_id: str, data: Transition, person=Depends(member), db: Session = Depends(get_db)):
    access(db, person, identity, write=True)
    lock(db, identity)
    row = db.get(CorporateDocument, document_id)
    if not row or row.organization_id != identity: raise HTTPException(404, "Document not found.")
    if row.status == data.status and row.revision == data.revision+1: return document_view(row)
    if row.revision != data.revision: raise HTTPException(409, "Document changed. Refresh before continuing.")
    if row.kind == "quote":
        if data.status == "issued":
            if person.role not in TEAM or row.status != "requested": raise HTTPException(409, "Only corporate staff can issue a requested quote.")
        elif data.status == "recalled":
            if person.role not in TEAM: raise HTTPException(403,"Only the corporate team can recall a quotation.")
            if row.status not in {"requested","issued"}: raise HTTPException(409,"Only a quotation awaiting acceptance can be recalled. Accepted documents require a formal correction.")
        elif data.status in {"accepted", "rejected"}:
            membership = db.get(OrganizationMember, (identity, person.id))
            if not membership or membership.role not in {"owner", "approver"}:
                raise HTTPException(403, "A client approver must accept or reject this quote.")
            if row.status != "issued" or datetime.fromisoformat(row.payload["expires_at"]) <= datetime.now(UTC):
                raise HTTPException(409, "Only a current issued quote can be accepted or rejected.")
        else: raise HTTPException(409, "Invalid quote transition.")
    elif row.kind == "payment":
        if person.role not in MANAGERS | {"corporate_assistant", "finance"} or data.status != "verified" or row.status != "submitted":
            raise HTTPException(403, "Manager verification is required for submitted payment evidence.")
        invoice = linked_document(db, identity, row.payload["linked_id"], "invoice")
        from .commerce_models import AppOrder
        if invoice.payload.get('linked_id') and db.scalar(select(AppOrder.id).where(AppOrder.snapshot['checkout']['corporate_quote_id'].as_string()==invoice.payload['linked_id'],AppOrder.state.notin_(['cancelled','payment_failed'])).limit(1)):
            raise HTTPException(409,'This invoice has an active app checkout. Resolve that payment before verifying separate evidence.')
        verified = sum(db.scalars(select(CorporateDocument.total_minor).where(CorporateDocument.organization_id==identity,
                       CorporateDocument.kind=="payment", CorporateDocument.status=="verified", CorporateDocument.payload["linked_id"].as_string()==invoice.id)))
        if verified + row.total_minor > invoice.total_minor: raise HTTPException(409, "Verified payments exceed the invoice balance.")
        if db.scalar(select(CorporateDocument.id).where(CorporateDocument.kind=="payment", CorporateDocument.status=="verified", CorporateDocument.payload["reference"].as_string()==row.payload["reference"])):
            raise HTTPException(409, "This payment reference is already verified.")
        db.add(CorporatePaymentReference(reference=row.payload["reference"], document_id=row.id))
        try: db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "This payment reference has already been verified.") from None
    else: raise HTTPException(409, "This document has no approval action.")
    row.status, row.revision = data.status, row.revision+1
    if row.kind=='quote' and data.status in {'issued','recalled'}:
        from .notifications import enqueue
        for customer_id in db.scalars(select(OrganizationMember.customer_id).where(OrganizationMember.organization_id==identity)):
            enqueue(db,customer_id,'corporate:'+row.id+':'+str(row.revision),'corporate_quote','Quotation recalled' if data.status=='recalled' else 'Your quotation is ready','Your corporate team has updated this quotation. Open your company portal for the current status.',{'url':'/corporate'})
    audit(db, person.id, "corporate.document_"+data.status, row.id, identity, revision=row.revision)
    db.commit()
    return document_view(row)


class AttachmentInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    mime: Literal['application/pdf','image/jpeg','image/png']
    data: str = Field(min_length=8,max_length=2800000)


@router.put('/companies/{identity}/documents/{document_id}/attachment')
def attach(identity:str,document_id:str,data:AttachmentInput,person=Depends(member),db:Session=Depends(get_db)):
    access(db,person,identity,write=True)
    lock(db,identity)
    document=db.get(CorporateDocument,document_id)
    if not document or document.organization_id!=identity: raise HTTPException(404,'Document not found.')
    if person.role not in TEAM and document.created_by!=person.id: raise HTTPException(403,'Only the document author can attach evidence.')
    try: content=base64.b64decode(data.data,validate=True)
    except ValueError: raise HTTPException(422,'Invalid attachment data.') from None
    signatures={'application/pdf':b'%PDF-', 'image/jpeg':b'\xff\xd8\xff','image/png':b'\x89PNG\r\n\x1a\n'}
    if len(content)>2000000 or not content.startswith(signatures[data.mime]): raise HTTPException(422,'Use a PDF, JPEG or PNG under 2 MB.')
    old=db.get(CorporateAttachment,document_id)
    if old:
        if old.mime!=data.mime or old.data!=content: raise HTTPException(409,'Evidence is already attached. Create a new record to correct it.')
    else:
        if document.status=='verified': raise HTTPException(409,'Verified payment evidence is locked.')
        db.add(CorporateAttachment(document_id=document_id,mime=data.mime,data=content,uploaded_by=person.id))
        audit(db,person.id,'corporate.evidence_attached',document_id,identity,mime=data.mime)
    db.commit()
    return {'status':'attached'}


@router.get('/companies/{identity}/documents/{document_id}/attachment')
def attachment(identity:str,document_id:str,person=Depends(member),db:Session=Depends(get_db)):
    access(db,person,identity)
    document=db.get(CorporateDocument,document_id)
    row=db.get(CorporateAttachment,document_id)
    if not document or document.organization_id!=identity or not row or (document.status=='draft' and person.role not in TEAM and document.created_by!=person.id): raise HTTPException(404,'Attachment not found.')
    extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[row.mime]
    return Response(row.data,media_type=row.mime,headers={'Cache-Control':'private, no-store','Content-Disposition':f'attachment; filename="cake-city-evidence.{extension}"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})


@router.get("/companies/{identity}/documents/{document_id}/print", response_class=HTMLResponse)
def print_document(identity: str, document_id: str, person=Depends(member), db: Session = Depends(get_db)):
    org = access(db, person, identity)
    row = db.get(CorporateDocument, document_id)
    if not row or row.organization_id != identity or (row.status == "draft" and person.role not in TEAM and row.created_by != person.id):
        raise HTTPException(404, "Document not found.")
    from pathlib import Path
    logo=base64.b64encode((Path(__file__).parent/'dashboard'/'cake-city-logo.png').read_bytes()).decode()
    rows = ''.join(f'<tr><td>{escape(l["name"])}</td><td>{l["quantity"]}</td><td>{l["unit_minor"]/100:,.2f}</td><td>{l["total_minor"]/100:,.2f}</td></tr>' for l in row.payload["lines"])
    html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Cake City {row.kind}</title><style>@page{{size:A4;margin:20mm}}body{{font:14px Arial;color:#30202b;max-width:850px;margin:40px auto}}header{{background:#412036;color:white;padding:32px;border-radius:18px}}h1{{font-size:34px;margin:12px 0}}.label{{letter-spacing:3px;color:#f4b4d6}}.meta{{display:flex;justify-content:space-between;padding:25px 0}}table{{width:100%;border-collapse:collapse}}td,th{{padding:14px;text-align:left;border-bottom:1px solid #e9dce5}}th{{background:#faf0f6}}.total{{font-size:26px;text-align:right;margin:30px 0}}footer{{border-top:1px solid #eadfe5;padding-top:20px;color:#65535f}}p{{white-space:pre-wrap}}@media print{{body{{margin:0}}}}</style></head><body><header><img alt="Cake City" src="data:image/png;base64,{logo}" width="140"><h1>{row.kind.title()}</h1><span>{escape(row.id)} · {escape(row.status.title())}</span></header><div class="meta"><div><h2>{escape(org.name)}</h2><p>{escape(org.billing_address)}</p></div><div><p>Issued {utc(row.created_at).strftime('%d %b %Y')}<br>Reference {escape(row.payload['reference'] or row.id[:8].upper())}<br>Currency KES</p></div></div><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit KES</th><th>Total KES</th></tr></thead><tbody>{rows}</tbody></table><p>Corporate savings: KES {row.payload.get("discount_minor",0)/100:,.2f}<br>Delivery: KES {row.payload.get("delivery_minor",0)/100:,.2f}<br>Tax: KES {row.payload.get("tax_minor",0)/100:,.2f}</p><div class="total">KES {row.total_minor/100:,.2f}</div><p>{escape(row.payload['notes'])}</p><p>Valid until: {escape(row.payload.get('expires_at') or 'Not applicable')}</p><footer>Commercial document. Payment evidence requires verification. This is not an eTIMS tax invoice. Thank you for celebrating with Cake City.</footer></body></html>'''
    return HTMLResponse(html, headers={"Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:"})


@router.get("/companies/{identity}/report.xlsx")
def report(identity: str, person=Depends(member), db: Session = Depends(get_db)):
    data = detail(identity, person, db)
    return workbook_response("corporate-documents", ["Document", "Type", "Status", "Reference", "KES", "Created"],
        [[d["id"], d["kind"], d["status"], d["reference"], d["total_minor"]/100, str(d["created_at"])] for d in data["documents"]])

class CompanyBrand(BaseModel):
    logo_url:str=Field(default='',max_length=1500)
    accent:str=Field(default='#B80070',pattern=r'^#[0-9a-fA-F]{6}$')

@router.put('/companies/{identity}/branding')
def brand_company(identity:str,data:CompanyBrand,person=Depends(member),db:Session=Depends(get_db)):
    access(db,person,identity,write=True)
    if person.role not in TEAM:
        membership=db.get(OrganizationMember,(identity,person.id))
        if not membership or membership.role!='owner':raise HTTPException(403,'Company owner or corporate team access required')
    from .routes_content import media_url
    try:media_url(data.logo_url)
    except ValueError as error:raise HTTPException(422,str(error)) from None
    key='cb:'+identity
    row=db.get(AppPolicy,key)
    if not row:row=AppPolicy(id=key);db.add(row)
    row.payload=data.model_dump();audit(db,person.id,'corporate.brand_updated',identity,identity);db.commit();return row.payload

@router.get('/companies/{identity}/documents/{document_id}/basket')
def quotation_basket(identity:str,document_id:str,person=Depends(member),db:Session=Depends(get_db)):
    access(db,person,identity,write=True)
    document=linked_document(db,identity,document_id,'quote')
    if document.status!='accepted':raise HTTPException(409,'Accept this quotation first')
    lines=[]
    for line in document.payload['lines']:
        product=db.get(AppProduct,line['product_id'])
        parent=db.get(AppProduct,product.parent_id) if product and product.parent_id else product
        if not product or not parent:raise HTTPException(409,'Catalogue item no longer available')
        lines.append({'key':str(product.id),'product_id':parent.id,'slug':parent.slug,'name':parent.payload.get('name',parent.slug),'image':next(iter(parent.payload.get('images',[])),{}).get('src',''),'price':product.price_minor/100,'quantity':line['quantity'],'selection':{'size':str(cake_weight(product,parent) or '')+'kg',**({'variation_id':product.id} if product.parent_id else {})}})
    return {'corporate_quote_id':document.id,'lines':lines}

@router.get('/companies/{identity}/orders')
def company_orders(identity:str,person=Depends(member),db:Session=Depends(get_db)):
    access(db,person,identity)
    from .commerce_models import AppOrder
    from .app_commerce import order_view
    documents=select(CorporateDocument.id).where(CorporateDocument.organization_id==identity,CorporateDocument.kind=='quote')
    orders=db.scalars(select(AppOrder).where(AppOrder.snapshot['checkout']['corporate_quote_id'].as_string().in_(documents)).order_by(AppOrder.created_at.desc()).limit(100))
    return [{**order_view(o),'can_open':o.customer_id==person.id} for o in orders]


def validate_checkout_invoice(db,document,total):
    from .commerce_models import AppOrder
    invoice=db.scalar(select(CorporateDocument).where(CorporateDocument.organization_id==document.organization_id,CorporateDocument.kind=='invoice',CorporateDocument.payload['linked_id'].as_string()==document.id))
    if not invoice:return
    verified=db.scalar(select(CorporateDocument.id).where(CorporateDocument.kind=='payment',CorporateDocument.status=='verified',CorporateDocument.payload['linked_id'].as_string()==invoice.id).limit(1))
    if verified:raise HTTPException(409,'This quotation already has an invoice payment. Ask your corporate team to arrange fulfilment without another payment.')
    if invoice.total_minor!=total:raise HTTPException(409,'The checkout differs from the issued invoice. Ask your corporate team to revise it before paying.')


def record_order_payment(db,order):
    # Called only after a verified live app payment, never for no-charge review.
    quote_id=order.snapshot.get('checkout',{}).get('corporate_quote_id')
    if not quote_id or order.channel!='app' or order.environment!='live' or order.payment_state!='completed':return
    quote=db.get(CorporateDocument,quote_id)
    if not quote:return
    invoice=db.scalar(select(CorporateDocument).where(CorporateDocument.organization_id==quote.organization_id,CorporateDocument.kind=='invoice',CorporateDocument.payload['linked_id'].as_string()==quote.id))
    if not invoice:
        invoice=CorporateDocument(id=str(uuid4()),organization_id=quote.organization_id,created_by=order.customer_id,request_key='app-invoice:'+order.reference,kind='invoice',status='issued',total_minor=order.total_minor,payload={**quote.payload,'linked_id':quote.id,'reference':order.reference,'order_reference':order.reference,'delivery_minor':order.delivery_minor,'tax_minor':order.snapshot.get('tax_minor',0),'notes':'Verified app order. Total includes the confirmed delivery and tax treatment.','expires_at':None})
        db.add(invoice);db.flush()
    old=db.scalar(select(CorporateDocument.id).where(CorporateDocument.organization_id==quote.organization_id,CorporateDocument.request_key=='app-payment:'+order.reference))
    if old:return
    payment=CorporateDocument(id=str(uuid4()),organization_id=quote.organization_id,created_by=order.customer_id,request_key='app-payment:'+order.reference,kind='payment',status='verified',total_minor=order.total_minor,payload={'lines':[],'linked_id':invoice.id,'reference':order.reference,'order_reference':order.reference,'notes':'Confirmed by the app payment reconciliation service.','expires_at':None})
    db.add(payment);db.flush()
    db.add(CorporatePaymentReference(reference=order.reference,document_id=payment.id))
    audit(db,order.customer_id,'corporate.app_payment_reconciled',payment.id,quote.organization_id)
