"""Public merchandising rules; historical orders and staff inventory stay intact."""
import re
from urllib.parse import urlsplit, parse_qs


def media_index(db):
    from sqlalchemy import select, func
    from .commerce_models import AppMedia
    values = set()
    for identity, source in db.execute(select(AppMedia.id, AppMedia.source_url).where(func.length(AppMedia.data) > 0)):
        values.add(source)
        values.add('/v1/app-media/' + identity)
    return values


def image_available(image, copied=None):
    if not isinstance(image, dict) or not isinstance(image.get('src'), str): return False
    source = image['src']
    parsed = urlsplit(source)
    if not (source.startswith('/v1/') or parsed.scheme == 'https'): return False
    if re.search(r'placeholder|woocommerce-placeholder|no[-_]image', source, re.I): return False
    if copied is None: return True
    if parsed.path.endswith('/v1/app-media/source'):
        return parse_qs(parsed.query).get('url', [''])[0] in copied
    if '/v1/app-media/' in parsed.path:
        return parsed.path[parsed.path.index('/v1/app-media/'):] in copied
    if parsed.hostname in {'cakecity.co.ke', 'www.cakecity.co.ke', 'i0.wp.com', 'i1.wp.com', 'i2.wp.com'}:
        return source in copied
    return True


def has_image(product, copied=None):
    if product is None: return False
    return any(image_available(image, copied) for image in (product.payload.get('images') or []))


def whole_cake(product):
    from .app_catalogue import is_accessory, is_cookie, is_cupcake
    name = str(product.payload.get('name', ''))
    categories = ' '.join(str(c.get('name', '')) for c in product.payload.get('categories', []))
    return (not product.parent_id and not is_accessory(product) and not is_cookie(product)
            and not is_cupcake(product) and not re.search(r'\bslices?\b|\bpieces?\b|\bbrownies?\b|\bmuffins?\b|\bdoughnuts?\b|\bcandles?\b|\btoppers?\b', name+' '+categories, re.I)
            and bool(re.search(r'cake|gateau|sponge|pound|forest|velvet|biscoff', name+' '+categories, re.I)))


def cake_colour(product):
    configured = product.payload.get('canvas_colour', '')
    if re.fullmatch(r'#[0-9a-fA-F]{6}', configured): return configured
    name = str(product.payload.get('name', '')).casefold()
    # Recipe-inspired starting colours, not a promise about every cake design.
    if any(word in name for word in ('caramel', 'vanilla', 'white forest', 'red velvet', 'cheesecake')): return '#FFF8EE'
    if any(word in name for word in ('chocolate', 'black forest', 'cocoa', 'fudge', 'ganache')): return '#70432F'
    if any(word in name for word in ('strawberry', 'pink simba')): return '#F4C1D0'
    if any(word in name for word in ('biscoff', 'lotus', 'coffee', 'butterscotch')): return '#D9B990'
    return '#FFF8EE'


def cake_weight(product, parent=None):
    p=product.payload
    attributes=' '.join(str(a.get('value','')) for a in p.get('variation_attributes',[]))
    text=attributes+' '+str(p.get('name',''))+' '+str((parent.payload if parent else {}).get('name',''))
    match=re.search(r'(\d+)(?:[.\-](\d+))?\s*[- ]?kg',text,re.I)
    return float(match.group(1)+('.'+match.group(2) if match.group(2) else '')) if match else None
