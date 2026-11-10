"""Odoo 19 JSON-2 methods. Every mutation and its receipt share one transaction."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from html import escape
from uuid import uuid4

from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError


RESOURCE_MODELS = {
    "categories": ("product.category", ["name", "parent_id"]),
    "invoices": ("account.move", ["name", "partner_id", "move_type", "state", "amount_total", "currency_id", "payment_state"]),
    "payments": ("account.payment", ["name", "partner_id", "amount", "currency_id", "state"]),
    "inventory": ("stock.quant", ["product_id", "location_id", "quantity", "reserved_quantity"]),
    "manufacturing": ("mrp.production", ["name", "product_id", "product_qty", "state"]),
    "bills_of_material": ("mrp.bom", ["product_tmpl_id", "product_qty", "type"]),
    "branches": ("stock.warehouse", ["name", "code", "partner_id"]),
    "campaigns": ("utm.campaign", ["name"]),
    "loyalty_programs": ("loyalty.program", ["name", "program_type", "active", "currency_id"]),
    "loyalty_rewards": ("loyalty.reward", ["description", "program_id", "required_points", "reward_type"]),
    "purchases": ("purchase.order", ["name", "partner_id", "state", "amount_total", "currency_id"]),
    "pricelists": ("product.pricelist", ["name", "currency_id", "active"]),
    "orders": ("sale.order", ["name", "partner_id", "state", "amount_total", "currency_id"]),
    "customers": ("res.partner", ["name", "email", "phone", "cakecity_mobile_customer_id"]),
    "loyalty": ("loyalty.card", ["partner_id", "program_id", "points", "active"]),
}


class Change(models.Model):
    _name = "cakecity.mobile.change"
    _description = "Versioned mobile change feed"
    _order = "id"

    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    resource = fields.Char(required=True)
    record_id = fields.Char(required=True)
    deleted = fields.Boolean()
    payload = fields.Json(required=True)

    def _envelope(self):
        self.ensure_one()
        return {"event_id": f"change:{self.id}", "resource": self.resource, "record_id": self.record_id,
                "version": self.id, "deleted": self.deleted, "payload": self.payload}


class Event(models.Model):
    _name = "cakecity.mobile.event"
    _description = "Mobile inbound event receipt"
    _order = "id desc"

    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    event_key = fields.Char(required=True, index=True)
    kind = fields.Char(required=True)
    aggregate = fields.Char(required=True, index=True)
    digest = fields.Char(required=True)
    payload = fields.Json(required=True)
    result = fields.Json(required=True)
    _event_unique = models.Constraint("UNIQUE(company_id, event_key)", "An app event can only be applied once.")


class Redemption(models.Model):
    _name = "cakecity.mobile.redemption"
    _description = "Odoo-authorized app reward coupon"

    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    partner_id = fields.Many2one("res.partner", required=True)
    card_id = fields.Many2one("loyalty.card", required=True)
    request_key = fields.Char(required=True)
    points = fields.Integer(required=True)
    code = fields.Char(required=True)
    amount_minor = fields.Integer(required=True)
    minimum_minor = fields.Integer(required=True)
    expires_at = fields.Datetime(required=True)
    used_order_id = fields.Many2one("sale.order")
    _request_unique = models.Constraint("UNIQUE(company_id, partner_id, request_key)", "Reward request already used.")
    _code_unique = models.Constraint("UNIQUE(code)", "Reward code already exists.")

    def _response(self):
        self.ensure_one()
        return {"id": str(self.id), "customer_id": self.partner_id.cakecity_mobile_customer_id,
            "request_key": self.request_key, "points": self.points, "code": self.code,
            "amount_minor": self.amount_minor, "minimum_minor": self.minimum_minor,
            "expires_at": self.expires_at.replace(tzinfo=timezone.utc).isoformat(), "status": "issued"}


class Bridge(models.AbstractModel):
    _name = "cakecity.mobile.bridge"
    _description = "Cake City app integration API"

    def _guard(self):
        if not self.env.su and not self.env.user.has_group("cakecity_mobile.group_mobile_integration"):
            raise AccessError("Cake City integration access required.")
        if not self.env.company.cakecity_mobile_enabled:
            raise ValidationError("Enable the app connector for this company first.")

    def _lock(self, key):
        number = int.from_bytes(hashlib.sha256(str(key).encode()).digest()[:8], "big", signed=True)
        self.env.cr.execute("SELECT pg_advisory_xact_lock(%s)", [number])

    @api.model
    def capabilities(self):
        self._guard()
        return {"contract": "cakecity-odoo-v1", "company_id": self.env.company.id,
            "products": True, "riders": True, "deliveries": True,
            "loyalty": bool(self.env.company.cakecity_mobile_program_id),
            "order_import": "quotation; confirmation only when explicitly enabled and totals match",
            "automatic_accounting_payment": False, "resources": list(RESOURCE_MODELS)}

    @api.model
    def changes(self, after=0, limit=100):
        self._guard()
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError("Invalid feed cursor or limit.")
        records = self.env["cakecity.mobile.change"].search(
            [("company_id", "=", self.env.company.id), ("id", ">", after)], order="id", limit=limit+1)
        page = records[:limit]
        return {"data": [item._envelope() for item in page],
                "next_cursor": page[-1].id if page else after, "has_more": len(records) > limit}

    def _publish(self, resource, record_id, payload, deleted=False):
        # Sequence allocation alone does not imply commit order. Serializing
        # publishers prevents a later committed ID hiding an earlier transaction.
        self._lock("feed:" + str(self.env.company.id))
        previous = self.env["cakecity.mobile.change"].sudo().search([
            ("company_id", "=", self.env.company.id), ("resource", "=", resource),
            ("record_id", "=", str(record_id))], order="id desc", limit=1)
        if previous and previous.payload == payload and previous.deleted == deleted:
            return previous
        # Only this private serializer elevates creation of a feed entry. Native
        # products, partners, sales and loyalty always use the caller's ACLs.
        return self.env["cakecity.mobile.change"].sudo().create({"company_id": self.env.company.id,
            "resource": resource, "record_id": str(record_id), "payload": payload, "deleted": deleted})

    @api.model
    def publish_catalogue(self, after=0, limit=25):
        self._guard()
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError("Invalid catalogue page.")
        records = self.env["product.template"].with_context(active_test=False).search([
            ("cakecity_mobile_export", "=", True), ("company_id", "in", [False, self.env.company.id]),
            ("id", ">", after)], order="id", limit=limit)
        records._mobile_publish()
        return {"published": len(records), "next_id": records[-1].id if records else after}

    @api.model
    def publish_riders(self):
        self._guard()
        records = self.env["res.partner"].with_context(active_test=False).search([
            ("cakecity_mobile_rider", "=", True), ("company_id", "in", [False, self.env.company.id])], limit=5000)
        records._mobile_publish_rider()
        return {"published": len(records)}

    @api.model
    def publish_resource(self, resource, after=0, limit=100):
        """Explicit backfill; custom modules can override this registry/serializer."""
        self._guard()
        if resource not in RESOURCE_MODELS or type(after) is not int or after < 0 or not 1 <= limit <= 100:
            raise ValidationError("Unknown resource or invalid page.")
        name, columns = RESOURCE_MODELS[resource]
        model = self.env[name]
        domain = [("id", ">", after)]
        if "company_id" in model._fields:
            domain += [("company_id", "in", [False, self.env.company.id])]
        if resource == "customers":
            domain += [("cakecity_mobile_customer_id", "!=", False)]
        rows = model.with_context(active_test=False).search(domain, order="id", limit=limit)
        for row in rows:
            self._publish(resource, row.id, row.read(columns)[0])
        return {"published": len(rows), "next_id": rows[-1].id if rows else after}

    @api.model
    def cron_snapshot(self):
        """Opt-in reconciliation cycle catches price-list and ancillary changes."""
        self._guard()
        company = self.env.company
        cursors = dict(company.cakecity_mobile_snapshot_cursor or {})
        for resource in RESOURCE_MODELS:
            result = self.publish_resource(resource, after=cursors.get(resource, 0), limit=100)
            cursors[resource] = result["next_id"] if result["published"] == 100 else 0
        products = self.publish_catalogue(after=cursors.get("products", 0), limit=25)
        cursors["products"] = products["next_id"] if products["published"] == 25 else 0
        self.publish_riders()
        company.cakecity_mobile_snapshot_cursor = cursors
        return True

    def _partner(self, data):
        identity = str(data["id"])
        self._lock("partner:" + identity)
        partner = self.env["res.partner"].with_context(active_test=False).search([
            ("cakecity_mobile_customer_id", "=", identity),
            ("company_id", "in", [False, self.env.company.id])], limit=1)
        values = {"name": data.get("name") or " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or identity,
                  "email": data.get("email") or False, "phone": data.get("phone") or False}
        if not partner:
            partner = self.env["res.partner"].create({**values, "cakecity_mobile_customer_id": identity,
                "company_id": self.env.company.id, "customer_rank": 1})
        else:
            partner.write(values)
        return partner

    @api.model
    def apply_event(self, event):
        self._guard()
        if not isinstance(event, dict) or not all(isinstance(event.get(key), str) for key in ("event_id", "kind", "aggregate", "occurred_at")):
            raise ValidationError("Invalid app event.")
        if len(json.dumps(event)) > 200000 or not isinstance(event.get("data"), dict):
            raise ValidationError("Invalid app payload.")
        self._lock("event:" + event["event_id"])
        signature = hashlib.sha256(json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        receipts = self.env["cakecity.mobile.event"]
        old = receipts.search([("company_id", "=", self.env.company.id), ("event_key", "=", event["event_id"])], limit=1)
        if old:
            if old.digest != signature:
                raise ValidationError("Event ID reused with different content.")
            return {**old.result, "status": "duplicate"}
        data, kind = event["data"], event["kind"]
        connector = self.with_context(cakecity_mobile_inbound=True)
        if kind == "customer.changed":
            connector._partner(data)
        elif kind.startswith("order."):
            connector._apply_order(data, kind)
        elif kind == "address.changed":
            connector._apply_address(data)
        elif kind == "enquiry.changed":
            connector._apply_enquiry(data)
        elif kind == "kitchen.assigned":
            order = self.env["sale.order"].search([("cakecity_mobile_reference", "=", data["reference"]), ("company_id", "=", self.env.company.id)], limit=1)
            if not order:
                raise ValidationError("Synchronize the verified paid order before its kitchen assignment.")
            order.with_context(cakecity_mobile_inbound=True).write({"cakecity_mobile_plant": data["plant"], "cakecity_mobile_kitchen_customer_id": data["assigned_to"]})
        elif kind == "logistics.task.changed":
            rider = connector._member(data["rider_id"])
            trips = self.env["cakecity.mobile.trip"].with_context(cakecity_mobile_inbound=True)
            trip = trips.search([("app_task_id", "=", data["id"]), ("company_id", "=", self.env.company.id)], limit=1)
            values = {key: data[key] for key in ("reference", "plant", "destination", "recipient", "phone", "items", "service_type", "status", "slot")}
            values["rider_id"] = rider.id
            if data.get("scheduled_at"):
                values["scheduled_at"] = datetime.fromisoformat(data["scheduled_at"]).replace(tzinfo=None)
            if trip:
                trip.write(values)
            else:
                trips.create({**values, "company_id": self.env.company.id, "app_task_id": data["id"]})
        elif kind != "celebration.changed":
            raise ValidationError("Register a handler for this app event type.")
        result = {"event_id": event["event_id"], "status": "accepted"}
        receipts.create({"company_id": self.env.company.id, "event_key": event["event_id"],
            "kind": kind, "aggregate": event["aggregate"], "digest": signature, "payload": event, "result": result})
        return result

    def _apply_address(self, data):
        parent = self._member(data["customer_id"])
        existing = self.env["res.partner"].with_context(active_test=False).search([
            ("cakecity_mobile_address_id", "=", data["id"]), ("parent_id", "=", parent.id)], limit=1)
        if data.get("deleted"):
            existing.write({"active": False})
            return
        values = {"name": data["recipient_name"], "phone": data["phone"], "street": data["line1"],
                  "street2": data.get("line2") or False, "city": data["city"], "type": "delivery", "active": True}
        if existing:
            existing.write(values)
        else:
            self.env["res.partner"].create({**values, "parent_id": parent.id,
                "company_id": self.env.company.id, "cakecity_mobile_address_id": data["id"]})

    def _apply_enquiry(self, data):
        partner = self._member(data["customer_id"])
        lead = self.env["crm.lead"].search([("cakecity_mobile_enquiry_id", "=", data["id"]),
                                            ("company_id", "=", self.env.company.id)], limit=1)
        values = {"name": data["subject"], "description": escape(data["details"]), "partner_id": partner.id}
        if lead:
            lead.write(values)
        else:
            self.env["crm.lead"].create({**values, "company_id": self.env.company.id,
                "cakecity_mobile_enquiry_id": data["id"]})

    def _apply_order(self, data, kind):
        if data.get("environment") != "live" or data.get("channel") != "app" or not data["reference"].startswith("APP-"):
            raise ValidationError("Simulated and sandbox orders cannot enter Odoo sales.")
        partner = self._partner(data["customer"])
        self._lock("order:" + data["reference"])
        order = self.env["sale.order"].search([("cakecity_mobile_reference", "=", data["reference"]),
                                               ("company_id", "=", self.env.company.id)], limit=1)
        if not order and data.get("payment_state") not in ("completed", "reversed"):
            return
        if not order:
            lines = []
            for line in data["lines"]:
                remote = str(line.get("odoo_id") or "")
                if not remote.startswith("variant:"):
                    raise ValidationError("Map every app SKU to an Odoo product variant before importing the order.")
                product = self.env["product.product"].browse(int(remote.split(":", 1)[1])).exists()
                if not product or not product.sale_ok or (product.company_id and product.company_id != self.env.company):
                    raise ValidationError("Odoo product unavailable for this company.")
                lines.append(fields.Command.create({"product_id": product.id, "name": line["name"],
                    "product_uom_qty": line["quantity"], "price_unit": line["unit_minor"]/100,
                    "discount": 100*data["discount_minor"]/data["subtotal_minor"] if data["subtotal_minor"] else 0}))
            if data["delivery_minor"]:
                product = self.env.company.cakecity_mobile_delivery_product_id
                if not product:
                    raise ValidationError("Configure the Odoo delivery service product first.")
                lines.append(fields.Command.create({"product_id": product.id, "name": "App delivery/branch transfer",
                    "product_uom_qty": 1, "price_unit": data["delivery_minor"]/100}))
            pricelist = self.env.company.cakecity_mobile_pricelist_id
            if not pricelist or pricelist.currency_id.name != "KES":
                raise ValidationError("Configure the approved KES app pricelist.")
            order = self.env["sale.order"].create({"partner_id": partner.id, "company_id": self.env.company.id,
                "pricelist_id": pricelist.id, "client_order_ref": data["reference"],
                "cakecity_mobile_reference": data["reference"], "order_line": lines})
        order.write({"cakecity_mobile_payment_state": data["payment_state"],
            "cakecity_mobile_provider_reference": data.get("tracking_id") or False,
            "cakecity_mobile_paid_minor": data["total_minor"],
            "cakecity_mobile_review": data["payment_state"] == "reversed" or round(order.amount_total*100) != data["total_minor"]})
        if data.get("state") in {"paid", "preparing", "ready", "out_for_delivery", "completed"}:
            order.cakecity_mobile_stage = data["state"]
        if data["payment_state"] == "completed" and not order.cakecity_mobile_review and self.env.company.cakecity_mobile_confirm_orders and order.state == "draft":
            order.action_confirm()
        code = data.get("checkout", {}).get("coupon_code")
        if code and data["payment_state"] == "completed":
            reward = self.env["cakecity.mobile.redemption"].search([("code", "=", code), ("company_id", "=", self.env.company.id)], limit=1)
            if reward:
                if reward.partner_id != partner or (reward.used_order_id and reward.used_order_id != order):
                    raise ValidationError("Odoo reward belongs to another customer/order.")
                reward.used_order_id = order

    def _member(self, customer_id):
        partner = self.env["res.partner"].search([("cakecity_mobile_customer_id", "=", customer_id),
            ("company_id", "in", [False, self.env.company.id])], limit=1)
        if not partner:
            raise ValidationError("Synchronize or explicitly link the app member in Odoo first.")
        return partner

    def _card(self, partner):
        program = self.env.company.cakecity_mobile_program_id
        if not program or not program.active or program.currency_id.name != "KES" or program.company_id != self.env.company:
            raise ValidationError("Configure the active company KES loyalty program.")
        cards = self.env["loyalty.card"].search([("partner_id", "=", partner.id), ("program_id", "=", program.id), ("active", "=", True)])
        if len(cards) != 1 or cards.points < 0 or int(cards.points) != cards.points:
            raise ValidationError("Link exactly one active integer-points Odoo loyalty card for this member.")
        return cards

    @api.model
    def club_transactions(self, customer_id, before=None, limit=20):
        self._guard()
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValidationError("Invalid history page size.")
        card = self._card(self._member(customer_id))
        domain = [("card_id", "=", card.id)]
        if before:
            cursor = self.env["loyalty.history"].browse(int(before)).exists()
            if not cursor or cursor.card_id != card:
                raise ValidationError("Invalid member history cursor.")
            domain.append(("id", "<", cursor.id))
        entries = self.env["loyalty.history"].search(domain, order="id desc", limit=limit+1)
        page = entries[:limit]
        if any(int(e.issued-e.used) != e.issued-e.used for e in page):
            raise ValidationError("Map fractional Odoo history points before exposing them in the integer-points app.")
        return {"data": [{"id": str(e.id), "points": int(e.issued-e.used), "description": e.description,
            "created_at": e.create_date.replace(tzinfo=timezone.utc).isoformat()} for e in page],
            "next_cursor": str(page[-1].id) if len(entries) > limit else None}

    @api.model
    def club_overview(self, customer_id):
        self._guard()
        partner = self._member(customer_id)
        card = self._card(partner)
        company = self.env.company
        if not partner.cakecity_mobile_tier:
            raise ValidationError("Set the member's app tier in Odoo first.")
        if min(company.cakecity_mobile_earn_minor, company.cakecity_mobile_point_minor, company.cakecity_mobile_expiry_days) <= 0:
            raise ValidationError("Confirm the app-facing Odoo loyalty rules first.")
        rewards = self.env["cakecity.mobile.redemption"].search([("partner_id", "=", partner.id), ("company_id", "=", company.id)], order="id desc", limit=100)
        return {"member_id": customer_id, "points": int(card.points), "debt": 0,
            "tier": partner.cakecity_mobile_tier, "next_tier": None,
            "rules": {"earn_spend_kes": company.cakecity_mobile_earn_minor/100,
                "point_value_kes": company.cakecity_mobile_point_minor/100,
                "expiry_days": company.cakecity_mobile_expiry_days, "minimum_redemption": company.cakecity_mobile_minimum_points,
                "minimum_order_multiple": company.cakecity_mobile_minimum_multiple},
            "redemption_available": company.cakecity_mobile_rewards_enabled, "review_required": False,
            "activity": self.club_transactions(customer_id, limit=30)["data"],
            "coupons": [{"id": str(r.id), "points": r.points, "code": r.code, "status": "issued", "request_key": r.request_key} for r in rewards],
            "source": "odoo"}

    @api.model
    def club_redeem(self, customer_id, points, request_key):
        self._guard()
        partner = self._member(customer_id)
        company = self.env.company
        if not isinstance(request_key, str) or not 16 <= len(request_key) <= 80:
            raise ValidationError("Invalid reward request key.")
        self._lock("reward:" + customer_id)
        rewards = self.env["cakecity.mobile.redemption"]
        old = rewards.search([("partner_id", "=", partner.id), ("company_id", "=", company.id), ("request_key", "=", request_key)], limit=1)
        if old:
            if old.points != points:
                raise ValidationError("Reward request key already used for a different amount.")
            return old._response()
        if (not company.cakecity_mobile_rewards_enabled or type(points) is not int
                or not company.cakecity_mobile_minimum_points <= points <= 500
                or company.cakecity_mobile_point_minor <= 0 or company.cakecity_mobile_minimum_multiple <= 0
                or company.cakecity_mobile_reward_days <= 0):
            raise ValidationError("Confirm the Odoo app reward policy and choose an eligible points amount.")
        card = self._card(partner)
        card.flush_recordset(["points"])
        self.env.cr.execute("SELECT id FROM loyalty_card WHERE id=%s FOR UPDATE", [card.id])
        card.invalidate_recordset(["points"])
        if card.points < points:
            raise ValidationError("Insufficient Odoo points.")
        card.points -= points
        self.env["loyalty.history"].create({"card_id": card.id, "description": "Points redeemed for Cake City app coupon", "used": points})
        amount = points*company.cakecity_mobile_point_minor
        reward = rewards.create({"company_id": company.id, "partner_id": partner.id, "card_id": card.id,
            "request_key": request_key, "points": points, "code": "odoo-app-"+uuid4().hex,
            "amount_minor": amount, "minimum_minor": amount*company.cakecity_mobile_minimum_multiple,
            "expires_at": fields.Datetime.now()+timedelta(days=company.cakecity_mobile_reward_days)})
        return reward._response()

    @api.model
    def club_members(self):
        self._guard()
        partners = self.env["res.partner"].search([("cakecity_mobile_customer_id", "!=", False),
            ("company_id", "in", [False, self.env.company.id])], order="id desc", limit=500)
        result = []
        for partner in partners:
            card = self._card(partner)
            orders = self.env["sale.order"].search([("partner_id", "=", partner.id),
                ("company_id", "=", self.env.company.id), ("cakecity_mobile_reference", "!=", False),
                ("cakecity_mobile_payment_state", "=", "completed")])
            result.append({"id": partner.cakecity_mobile_customer_id, "name": partner.name, "email": partner.email or "",
                "points": int(card.points), "spend_minor": sum(orders.mapped("cakecity_mobile_paid_minor")),
                "purchases": len(orders), "review_required": any(orders.mapped("cakecity_mobile_review"))})
        return result
