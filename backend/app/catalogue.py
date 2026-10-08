"""Bounded public-read cache; never used to approve checkout or payment."""
import asyncio
import hashlib
import json
import gzip
from collections import OrderedDict
from time import monotonic

import httpx

from .config import get_settings

PRODUCT_FIELDS = {"id", "name", "slug", "type", "description", "short_description", "is_in_stock", "is_purchasable", "on_sale", "prices", "images", "categories", "attributes", "variations", "average_rating", "review_count"}


def mobile_product(value):
    result = {key: item for key, item in value.items() if key in PRODUCT_FIELDS}
    if "images" in result:
        result["images"] = [{key: item for key, item in image.items() if key in ("id", "src", "alt")} for image in result["images"]]
    return result


class Catalogue:
    def __init__(self):
        self.client = None
        self.cache = OrderedDict()
        self.flights = {}
        self.redis = None

    async def start(self):
        if get_settings().redis_url:
            from redis.asyncio import Redis
            self.redis = Redis.from_url(get_settings().redis_url, socket_timeout=1, socket_connect_timeout=1, max_connections=20)
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(15, connect=5),
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )

    async def close(self):
        if self.redis:
            await self.redis.aclose()
            self.redis = None
        pending = list(self.flights.values())
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        if self.client:
            await self.client.aclose()
        self.cache.clear()
        self.flights.clear()

    async def products(self, params):
        key = tuple(sorted(params.items()))
        cached = self.cache.get(key)
        if cached and cached[0] + 240 > monotonic():
            self.cache.move_to_end(key)
            if cached[0] <= monotonic() and key not in self.flights and len(self.flights) < 40:
                task = asyncio.create_task(self._load(key, params))
                self.flights[key] = task
                task.add_done_callback(lambda finished: finished.exception() if not finished.cancelled() else None)
            return cached[1]
        if key not in self.flights:
            # Bound distinct requests so unique searches cannot grow the cache
            # or outstanding upstream work without limit.
            if len(self.flights) >= 40:
                raise httpx.PoolTimeout("Catalogue is busy")
            self.flights[key] = asyncio.create_task(self._load(key, params))
        return await asyncio.shield(self.flights[key])

    async def response_bytes(self, params, compressed=False):
        data = await self.products(params)
        cached = self.cache.get(tuple(sorted(params.items())))
        if cached:
            return cached[3] if compressed else cached[2]
        body = json.dumps(data, separators=(",", ":")).encode()
        return gzip.compress(body) if compressed else body

    async def _load(self, key, params):
        try:
            shared_key = "cakecity:catalogue:v2:" + hashlib.sha256(json.dumps(key).encode()).hexdigest()
            if self.redis:
                from redis.exceptions import RedisError
                try:
                    cached = await self.redis.get(shared_key)
                    if cached:
                        data = json.loads(cached)
                        self._remember(key, data)
                        return data
                except (RedisError, ValueError):
                    pass  # Public reads may use bounded upstream fallback.
            response = await self.client.get(
                get_settings().woocommerce_store_url + "/products", params=params,
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise ValueError("Invalid catalogue response")
            data = [mobile_product(item) for item in data]
            self._remember(key, data)
            if self.redis:
                try:
                    await self.redis.set(shared_key, json.dumps(data), ex=60)
                except RedisError:
                    pass
            return data
        finally:
            self.flights.pop(key, None)

    def _remember(self, key, data):
        body = json.dumps(data, separators=(",", ":")).encode()
        self.cache[key] = (monotonic() + 60, data, body, gzip.compress(body))
        self.cache.move_to_end(key)
        while len(self.cache) > 256:
            self.cache.popitem(last=False)


catalogue = Catalogue()
