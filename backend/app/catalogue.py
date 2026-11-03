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
    if not isinstance(value, dict):
        raise ValueError("Invalid catalogue product")
    result = {key: item for key, item in value.items() if key in PRODUCT_FIELDS}
    if "images" in result:
        if not isinstance(result["images"], list) or any(not isinstance(image, dict) for image in result["images"]):
            raise ValueError("Invalid catalogue images")
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
            from .db import SessionLocal
            from .app_catalogue import products
            with SessionLocal() as db:
                data, _ = products(db, params)
            self._remember(key, data)
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
