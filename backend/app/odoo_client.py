"""Private Odoo 19 JSON-2 transport. No merchant or ERP keys reach the mobile app."""
import re
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

from .config import get_settings


BRIDGE = "cakecity.mobile.bridge"
# Internal server code can call any installed model/method. Public routes expose
# only the named bridge operations and admin-only schema discovery below.
RESOURCES = {
    "products": "product.product", "categories": "product.category",
    "customers": "res.partner", "loyalty": "loyalty.card",
    "loyalty_programs": "loyalty.program", "loyalty_rewards": "loyalty.reward",
    "riders": "res.partner", "deliveries": "stock.picking",
    "orders": "sale.order", "invoices": "account.move",
    "payments": "account.payment", "inventory": "stock.quant",
    "manufacturing": "mrp.production", "bills_of_material": "mrp.bom",
    "branches": "stock.warehouse", "campaigns": "utm.campaign",
    "enquiries": "crm.lead", "support": "helpdesk.ticket",
    "purchases": "purchase.order", "pricelists": "product.pricelist",
    "logistics_tasks": "cakecity.mobile.trip", "kitchen_tasks": "sale.order",
}


def connection_settings():
    s = get_settings()
    url = urlsplit(s.odoo_url)
    if not s.odoo_enabled:
        raise HTTPException(503, "Odoo integration is disabled.")
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in ("", "/") or url.query or url.fragment
            or not s.odoo_database or not s.odoo_api_key or not s.odoo_company_id):
        raise HTTPException(503, "Configure the private Odoo HTTPS origin, database, API key and company.")
    return s


class OdooClient:
    async def call(self, model, method, **arguments):
        s = connection_settings()
        if not re.fullmatch(r"[a-z][a-z0-9_.]*", model) or not re.fullmatch(r"[a-z][a-z0-9_]*", method):
            raise HTTPException(422, "Invalid Odoo model or method.")
        # Company scope cannot be overridden by an operation's arguments.
        context = dict(arguments.pop("context", {}))
        context.update(allowed_company_ids=[s.odoo_company_id], company_id=s.odoo_company_id,
                       tracking_disable=True, mail_create_nosubscribe=True)
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
                response = await client.post(s.odoo_url.rstrip("/") + f"/json/2/{model}/{method}",
                    headers={"Authorization": "bearer " + s.odoo_api_key,
                             "X-Odoo-Database": s.odoo_database, "User-Agent": "CakeCity-App-Connector/1"},
                    json={**arguments, "context": context})
            if response.status_code in (401, 403):
                raise HTTPException(503, "The Odoo integration account needs operator review.")
            if response.status_code >= 400:
                raise HTTPException(502, "Odoo rejected the operation; review its mapping and permissions.")
            if response.status_code != 200:
                raise HTTPException(502, "Unexpected Odoo response; redirects are not followed.")
            return response.json()
        except (httpx.HTTPError, ValueError):
            # Never expose upstream tracebacks, URLs, customer payloads or tokens.
            raise HTTPException(502, "Odoo is temporarily unavailable. The operation must be reconciled using its original request key.") from None

    async def bridge(self, method, **arguments):
        return await self.call(BRIDGE, method, **arguments)
