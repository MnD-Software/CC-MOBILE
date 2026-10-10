import hashlib
import logging
from time import perf_counter, time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .catalogue import catalogue
from .config import get_settings

logger = logging.getLogger("cakecity.requests")


class RequestTelemetry(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        identity = uuid4().hex
        started = perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = identity
        public_read = request.method == "GET" and (request.url.path.startswith("/v1/catalogue/") or request.url.path == "/v1/content" or request.url.path.startswith("/v1/content/products/") or request.url.path.startswith("/v1/content/assets/"))
        if not public_read or response.status_code != 200:
            response.headers["Cache-Control"] = "private, no-store"
        # Route templates exclude customer ids, order keys and query strings.
        route = getattr(request.scope.get("route"), "path", "unmatched")
        logger.info("request_id=%s method=%s route=%s status=%s duration_ms=%.1f",
            identity, request.method, route, response.status_code, (perf_counter()-started)*1000)
        return response


class SharedRateLimit(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not catalogue.redis or not request.url.path.startswith("/v1/"):
            return await call_next(request)
        from redis.exceptions import RedisError
        # Use the authenticated token fingerprint or direct peer; never trust
        # an arbitrary client-supplied forwarded address.
        auth_route = request.url.path.startswith("/v1/auth/")
        identity = request.client.host if request.client else "unknown"
        auth = request.headers.get("authorization", "")
        if not auth_route and auth.lower().startswith("bearer "):
            import jwt
            try:
                claims = jwt.decode(auth[7:], get_settings().jwt_secret, algorithms=["HS256"])
                identity = "member:" + str(claims["sub"])
            except (jwt.PyJWTError, KeyError):
                pass
        subject = hashlib.sha256(identity.encode()).hexdigest()
        limit = 20 if auth_route else 180
        bucket = f"cakecity:rate:{'auth' if auth_route else 'api'}:{subject}:{int(time())//60}"
        try:
            count = await catalogue.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],61) end; return n", 1, bucket)
        except RedisError:
            # Auth/mutation protection fails closed; cached public reads remain
            # available during a cache outage.
            if auth_route or request.method != "GET":
                return JSONResponse({"detail": "Service temporarily busy"}, status_code=503)
            return await call_next(request)
        if count > limit:
            return JSONResponse({"detail": "Too many requests. Please try again shortly."}, status_code=429, headers={"Retry-After": str(60-int(time())%60)})
        return await call_next(request)
