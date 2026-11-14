"""Inventory-backed DIY; custom unpriced production work stays a brief."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .commerce_models import AppProduct
from .routes_club import member
from .product_rules import whole_cake, has_image, image_available, media_index, cake_colour, cake_weight

router = APIRouter(prefix="/v1/diy", tags=["inventory-diy"])


def kind(product):
    p = product.payload
    if product.parent_id: return "variation"
    name = p.get("name", "").lower()
    cats = ' '.join(str(c.get('name','')).lower() for c in p.get('categories',[]))
    if any(w in cats for w in ['accessor','candle','party','decor']) or any(w in name for w in ['sparkling candle','number candle','balloon pack','cake topper']): return 'decor'
    if any(w in cats for w in ['cookie','cupcake']) or 'cupcake' in name: return 'other'
    return 'cake' if whole_cake(product) else 'other'


def available(product):
    return product.enabled and product.price_minor is not None and product.price_minor > 0 and (
        product.payload.get('order_mode') == 'made_to_order' or product.allocation-product.reserved-product.sold > 0)


def product_view(db, product, copied=None):
    p=product.payload
    return {'id':product.id,'parent_id':product.parent_id,'name':p.get('name',product.slug),'slug':product.slug,
            'price_minor':product.price_minor,'image':next((image.get('src') for image in (p.get('images') or []) if image_available(image, copied)), None),
            'attributes':p.get('variation_attributes',[]),'type':p.get('type','simple'),'kind':kind(product), 'canvas_colour':cake_colour(product)}


@router.get('/inventory')
def inventory(search: str = '', group: str = 'cake', db: Session = Depends(get_db)):
    if group not in {'cake','decor'} or len(search)>100: raise HTTPException(422,'Choose a valid inventory search.')
    query=select(AppProduct).where(AppProduct.parent_id.is_(None),AppProduct.enabled.is_(True))
    if search.strip(): query=query.where(AppProduct.payload['name'].as_string().icontains(search.strip(),autoescape=True))
    copied=media_index(db)
    result=[]
    for p in db.scalars(query.order_by(AppProduct.price_minor,AppProduct.id)):
        if kind(p)!=group or p.payload.get('payment_test') or not has_image(p, copied): continue
        children=list(db.scalars(select(AppProduct).where(AppProduct.parent_id==p.id).order_by(AppProduct.price_minor))) if p.payload.get('type')=='variable' else []
        options=[c for c in children if available(c) and (cake_weight(c,p) or 0)>=2] if group=='cake' else [c for c in children if available(c)]
        if group=='cake' and not children and (cake_weight(p) or 0)<2: continue
        if p.payload.get('type')=='variable' and not options: continue
        if children and not options or not children and not available(p): continue
        result.append({**product_view(db,p,copied),'variants':[product_view(db,c,copied) for c in options]})
        if len(result)==40: break
    return result


class Design(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    product_id:int=Field(gt=0)
    variation_id:int|None=Field(default=None,gt=0)
    extras:list[int]=Field(default_factory=list,max_length=10)
    colour:str=Field(default='#F7B6D2',pattern=r'^#[0-9a-fA-F]{6}$')
    message:str=Field(default='',max_length=32)


@router.post('/quote')
def quote(data:Design,person=Depends(member),db:Session=Depends(get_db)):
    parent=db.get(AppProduct,data.product_id)
    sku=db.get(AppProduct,data.variation_id or data.product_id)
    if not parent or kind(parent)!='cake' or not parent.enabled or not has_image(parent) or not sku or not available(sku): raise HTTPException(409,'Choose an available whole cake with a product photo from inventory.')
    if data.variation_id and sku.parent_id!=parent.id or not data.variation_id and parent.payload.get('type')=='variable': raise HTTPException(422,'Choose a valid flavour, size and icing combination.')
    if (cake_weight(sku,parent) or 0)<2: raise HTTPException(422,'Custom cake orders start at 2 kg. Choose a published size of at least 2 kg.')
    if len(data.extras)!=len(set(data.extras)): raise HTTPException(422,'Select each decoration once.')
    parts=[(parent,sku)]
    for identity in data.extras:
        extra=db.get(AppProduct,identity)
        if not extra or kind(extra)!='decor' or not available(extra) or extra.payload.get('type')=='variable': raise HTTPException(409,'A selected decoration is unavailable.')
        parts.append((extra,extra))
    from datetime import UTC,datetime,timedelta
    import re
    def size(p,s):
        if kind(p)=='decor': return 'Item'
        text=' '.join(a.get('value','') for a in s.payload.get('variation_attributes',[]))+' '+p.payload.get('name','')
        match=re.search(r'(\d+)(?:[.\-](\d+))?\s*kg',text,re.I)
        return (match.group(1)+('.'+match.group(2) if match.group(2) else '')+'kg') if match else '1kg'
    return {'subtotal_minor':sum(s.price_minor for _,s in parts),'currency':'KES','expires_at':(datetime.now(UTC)+timedelta(minutes=10)).isoformat(),
            'colour':data.colour,'message':data.message,'preview_notice':'Illustrative design. Custom icing, colours and decorations need kitchen confirmation if they are not included in the selected inventory product.',
            'lines':[{'product_id':p.id,'variation_id':s.id if s.parent_id else None,'name':p.payload.get('name',p.slug),'slug':p.slug,'image':next(iter(p.payload.get('images',[])),{}).get('src'),
                      'unit_minor':s.price_minor,'size':size(p,s),'attributes':s.payload.get('variation_attributes',[]),'kind':kind(p)} for p,s in parts]}
