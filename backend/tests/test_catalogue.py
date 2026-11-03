import asyncio
import pytest
from app.catalogue import Catalogue, mobile_product

@pytest.mark.parametrize("payload", [None, {"images":None}, {"images":[None]}])
def test_malformed_imported_product_is_rejected(payload):
    with pytest.raises(ValueError): mobile_product(payload)

def test_catalogue_uses_persistent_app_store_not_a_website(monkeypatch):
    from app import app_catalogue
    calls=[]
    def stored(db,params):
        calls.append(params)
        return [{"id":1}],1
    monkeypatch.setattr(app_catalogue,"products",stored)
    async def scenario():
        store=Catalogue()
        class ForbiddenWebsite:
            async def get(self,*args,**kwargs): raise AssertionError("website unavailable")
        store.client=ForbiddenWebsite()
        values=await asyncio.gather(*(store.products({"page":1}) for _ in range(20)))
        assert all(value==[{"id":1}] for value in values)
        assert len(calls)==1
    asyncio.run(scenario())
