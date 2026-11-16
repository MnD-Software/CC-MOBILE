from sqlalchemy.orm import Session
from test_pesapal import system
from test_logistics import actor
from app.commerce_models import AppProduct

def test_custom_category_hidden_until_operator_enables_it(system):
    s=system; c=s['client']
    with Session(s['engine']) as db:
        product=db.get(AppProduct,12)
        product.payload={**product.payload,'categories':[{'id':702,'name':'Custom Cakes','slug':'custom-cakes'}]}
        db.commit()
    assert c.get('/v1/catalogue/products').json()==[]
    assert c.get('/v1/catalogue/categories').json()==[]
    assert c.get('/v1/catalogue/products?include=12').json()==[]
    assert c.post("/v1/app-checkout/quote",json=s["payload"]).status_code==409
    assert c.put('/v1/admin/app-categories/702',json={'enabled':True,'revision':0}).status_code==403
    actor()
    items=c.get('/v1/admin/app-categories').json()
    assert items[0]['enabled'] is False
    path='/v1/admin/app-categories/702'
    assert c.put(path,json={'enabled':True,'revision':0}).status_code==200
    assert len(c.get('/v1/catalogue/products').json())==1
    assert c.put(path,json={'enabled':False,'revision':0}).status_code==409
    assert c.put(path,json={'enabled':False,'revision':1}).status_code==200
    assert c.get('/v1/catalogue/products').json()==[]
