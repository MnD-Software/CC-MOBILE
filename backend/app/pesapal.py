"""Server-only Pesapal accounts. Existing payments retain their merchant profile."""
import json
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import HTTPException

from .config import get_settings

PREFIX = "/v1/payments/pesapal"
BASES = {"live": "https://pay.pesapal.com/v3/api", "sandbox": "https://cybqa.pesapal.com/pesapalv3/api"}


def public_url():
    s = get_settings()
    value = (s.pesapal_public_url or s.app_public_url or s.render_external_url).rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        return ""
    return value


def accounts():
    s = get_settings()
    if s.pesapal_accounts_json:
        try:
            profiles = json.loads(s.pesapal_accounts_json)
            if not isinstance(profiles, dict):
                raise ValueError()
            for key, profile in profiles.items():
                if not isinstance(key, str) or not isinstance(profile, dict) or profile.get("environment") not in BASES:
                    raise ValueError()
                if not all(isinstance(profile.get(field), str) and profile[field] for field in ("consumer_key", "consumer_secret")):
                    raise ValueError()
            return profiles
        except (TypeError, ValueError):
            raise HTTPException(503, "Payment account configuration needs operator review.") from None
    return {s.pesapal_account_id: {"consumer_key": s.pesapal_consumer_key, "consumer_secret": s.pesapal_consumer_secret,
                                   "environment": s.pesapal_environment}}


def account(account_id=None):
    profile = accounts().get(account_id or get_settings().pesapal_account_id)
    if not profile or not profile.get("consumer_key") or not profile.get("consumer_secret") or not public_url():
        raise HTTPException(503, "This payment account is not available. Contact Cake City before paying again.")
    return profile


def configured():
    try:
        account()
        return True
    except HTTPException:
        return False


def has_error(value):
    error = value.get("error")
    return str(value.get("status", "200")) != "200" or (any(error.values()) if isinstance(error, dict) else bool(error))


async def request_json(method, url, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            value = response.json()
            if not isinstance(value, (dict, list)):
                raise ValueError()
            return value
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Payment confirmation is temporarily unavailable. Do not start a second payment.") from None


class Provider:
    def __init__(self, account_id):
        self.profile = account(account_id)
        self.base = BASES[self.profile["environment"]]
        self.token = None

    async def call(self, method, path, body=None, params=None):
        if not self.token:
            result = await request_json("POST", self.base + "/Auth/RequestToken", json={
                "consumer_key": self.profile["consumer_key"], "consumer_secret": self.profile["consumer_secret"]})
            if not isinstance(result, dict) or has_error(result) or not isinstance(result.get("token"), str) or not result["token"]:
                raise HTTPException(502, "Pesapal authentication needs operator review.")
            self.token = result["token"]
        result = await request_json(method, self.base + path, headers={"Authorization": "Bearer " + self.token,
                                   "Accept": "application/json"}, params=params, **({"json": body} if body is not None else {}))
        if isinstance(result, dict):
            if has_error(result):
                raise HTTPException(502, "Pesapal could not confirm this request. Check the existing payment.")
        elif path != "/URLSetup/GetIpnList":
            raise HTTPException(502, "Pesapal returned an invalid response.")
        return result

    async def notification_id(self):
        target = public_url() + PREFIX + "/ipn"
        entries = await self.call("GET", "/URLSetup/GetIpnList")
        if isinstance(entries, list):
            for entry in entries:
                if entry.get("url") == target and entry.get("ipn_status") == 1 and entry.get("ipn_notification_type_description") == "GET":
                    return str(UUID(entry["ipn_id"]))
        registered = await self.call("POST", "/URLSetup/RegisterIPN", {"url": target, "ipn_notification_type": "GET"})
        try:
            return str(UUID(registered["ipn_id"]))
        except (KeyError, TypeError, ValueError):
            raise HTTPException(502, "Pesapal notification registration failed.") from None
