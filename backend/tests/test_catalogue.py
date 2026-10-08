import asyncio

import httpx

from app.catalogue import Catalogue


def test_concurrent_public_reads_share_one_upstream_request_and_failures_can_retry():
    async def scenario():
        calls = []
        fail = [False]

        class Upstream:
            async def get(self, url, params):
                calls.append(params)
                await asyncio.sleep(.01)
                if fail[0]:
                    raise httpx.ConnectError("offline")
                return httpx.Response(200, json=[{"id": 1}], request=httpx.Request("GET", url))

        store = Catalogue()
        store.client = Upstream()
        results = await asyncio.gather(*(store.products({"page": 1}) for _ in range(100)))
        assert all(result == [{"id": 1}] for result in results)
        assert len(calls) == 1
        assert await store.products({"page": 1}) == [{"id": 1}]
        assert len(calls) == 1
        fail[0] = True
        results = await asyncio.gather(*(store.products({"page": 2}) for _ in range(10)), return_exceptions=True)
        assert all(isinstance(result, httpx.ConnectError) for result in results)
        assert len(calls) == 2 and not store.flights
        fail[0] = False
        assert await store.products({"page": 2}) == [{"id": 1}]
        assert len(calls) == 3
    asyncio.run(scenario())
