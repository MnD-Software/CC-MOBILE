"""Native Odoo records expose explicit app fields; ordinary business workflows stay in Odoo."""
import base64

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class Company(models.Model):
    _inherit = "res.company"

    cakecity_mobile_enabled = fields.Boolean("Enable Cake City app connector")
    cakecity_mobile_snapshot_cursor = fields.Json(copy=False)
    cakecity_mobile_pricelist_id = fields.Many2one("product.pricelist", string="Approved app pricelist")
    cakecity_mobile_delivery_product_id = fields.Many2one("product.product", string="App delivery service product")
    cakecity_mobile_confirm_orders = fields.Boolean("Confirm imported orders when totals match")
    cakecity_mobile_program_id = fields.Many2one("loyalty.program", string="App loyalty program")
    cakecity_mobile_rewards_enabled = fields.Boolean("Enable app reward conversion")
    cakecity_mobile_earn_minor = fields.Integer("Published earning spend in KES minor units")
    cakecity_mobile_point_minor = fields.Integer("App reward value per point in KES minor units")
    cakecity_mobile_expiry_days = fields.Integer("Published points expiry days")
    cakecity_mobile_reward_days = fields.Integer("App reward coupon validity days")
    cakecity_mobile_minimum_points = fields.Integer("Minimum app redemption points", default=100)
    cakecity_mobile_minimum_multiple = fields.Integer("Minimum order / reward value", default=10)


class Partner(models.Model):
    _inherit = "res.partner"

    cakecity_mobile_customer_id = fields.Char("App customer ID", copy=False, index=True)
    cakecity_mobile_address_id = fields.Char("App address ID", copy=False, index=True)
    cakecity_mobile_tier = fields.Selection([(s, s) for s in ("Silver", "Gold", "Diamond", "Platinum")], string="App loyalty tier")
    cakecity_mobile_rider = fields.Boolean("Cake City app rider")
    _customer_unique = models.Constraint("UNIQUE(cakecity_mobile_customer_id)", "App customer already linked to an Odoo contact.")
    _address_unique = models.Constraint("UNIQUE(cakecity_mobile_address_id)", "App address already linked.")

    def _mobile_publish_rider(self):
        for record in self:
            company = record.company_id or self.env.company
            if company.cakecity_mobile_enabled:
                self.env["cakecity.mobile.bridge"].with_company(company)._publish("riders", str(record.id),
                    {"name": record.name, "phone": record.phone or "", "active": bool(record.active and record.cakecity_mobile_rider)},
                    deleted=not record.cakecity_mobile_rider)

    @api.model_create_multi
    def create(self, values):
        records = super().create(values)
        records.filtered("cakecity_mobile_rider")._mobile_publish_rider()
        return records

    def write(self, values):
        riders = self.filtered("cakecity_mobile_rider")
        result = super().write(values)
        if not self.env.context.get("cakecity_mobile_inbound") and {"name", "phone", "active", "cakecity_mobile_rider"} & values.keys():
            (riders | self.filtered("cakecity_mobile_rider"))._mobile_publish_rider()
        return result


class Template(models.Model):
    _inherit = "product.template"

    cakecity_mobile_export = fields.Boolean("Publish to Cake City app")

    def _mobile_publish(self):
        company = self.env.company
        if not company.cakecity_mobile_enabled:
            return
        bridge = self.env["cakecity.mobile.bridge"]
        pricelist = company.cakecity_mobile_pricelist_id
        if not pricelist or pricelist.currency_id.name != "KES":
            raise ValidationError("Configure the approved KES app pricelist before publishing products.")
        for template in self:
            if template.company_id and template.company_id != company:
                raise ValidationError("Publish products only from the active app company.")
            variants = template.with_context(active_test=False).product_variant_ids
            enabled = bool(template.active and template.sale_ok and template.cakecity_mobile_export)
            if not enabled:
                for variant in variants:
                    bridge._publish("products", f"variant:{variant.id}", {}, deleted=True)
                bridge._publish("products", f"template:{template.id}", {}, deleted=True)
                continue
            attributes = [{"name": line.attribute_id.name, "options": line.value_ids.mapped("name"), "variation": True}
                          for line in template.attribute_line_ids]
            prices = {variant.id: round(pricelist._get_product_price(variant, 1)*100) for variant in variants}
            if not prices or min(prices.values()) <= 0:
                raise ValidationError("Confirm a positive KES app price for every variant.")
            image = template.image_1024
            image_data = base64.b64decode(image) if image else b""
            mime = "image/jpeg" if image_data.startswith(b"\xff\xd8") else "image/webp" if image_data[8:12] == b"WEBP" else "image/png"
            common = {"currency": "KES", "enabled": enabled, "description": template.description_sale or "",
                "categories": [{"id": template.categ_id.id, "name": template.categ_id.name, "slug": f"odoo-{template.categ_id.id}"}],
                "image_base64": image.decode() if isinstance(image, bytes) else image or None, "image_mime": mime}
            bridge._publish("products", f"template:{template.id}", {**common, "name": template.name, "type": "variable",
                "price_minor": min(prices.values()), "attributes": attributes})
            for variant in variants:
                selection = [{"name": value.attribute_id.name, "value": value.name} for value in variant.product_template_attribute_value_ids]
                bridge._publish("products", f"variant:{variant.id}", {**common, "name": variant.display_name,
                    "type": "variation", "sku": variant.default_code or "", "parent_id": f"template:{template.id}",
                    "price_minor": prices[variant.id], "enabled": enabled and variant.active, "variation_attributes": selection})

    @api.model_create_multi
    def create(self, values):
        records = super().create(values)
        records.filtered("cakecity_mobile_export")._mobile_publish()
        return records

    def write(self, values):
        published = self.filtered("cakecity_mobile_export")
        result = super().write(values)
        if {"cakecity_mobile_export", "name", "description_sale", "list_price", "active", "sale_ok", "image_1920", "image_1024", "attribute_line_ids", "categ_id"} & values.keys():
            (published | self.filtered("cakecity_mobile_export"))._mobile_publish()
        return result


class Variant(models.Model):
    _inherit = "product.product"

    def write(self, values):
        result = super().write(values)
        if {"active", "default_code", "lst_price", "product_template_attribute_value_ids"} & values.keys():
            self.product_tmpl_id.filtered("cakecity_mobile_export")._mobile_publish()
        return result


class Sale(models.Model):
    _inherit = "sale.order"

    cakecity_mobile_reference = fields.Char("App order reference", copy=False, index=True)
    cakecity_mobile_payment_state = fields.Char("Provider verification state", copy=False, readonly=True)
    cakecity_mobile_provider_reference = fields.Char("Pesapal tracking reference", copy=False, readonly=True)
    cakecity_mobile_paid_minor = fields.Integer("App payment total (KES minor units)", readonly=True)
    cakecity_mobile_review = fields.Boolean("App reconciliation required", readonly=True)
    cakecity_mobile_stage = fields.Selection([(s, s.replace("_", " ").title()) for s in
        ("paid", "preparing", "ready", "out_for_delivery", "completed")], string="App fulfilment stage", copy=False)
    cakecity_mobile_rider_id = fields.Many2one("res.partner", string="App rider", domain=[("cakecity_mobile_rider", "=", True)])
    cakecity_mobile_plant = fields.Char("App production plant code")
    cakecity_mobile_kitchen_customer_id = fields.Char("App kitchen worker ID")
    _app_order_unique = models.Constraint("UNIQUE(company_id, cakecity_mobile_reference)", "An app order can only be imported once.")

    def write(self, values):
        result = super().write(values)
        if not self.env.context.get("cakecity_mobile_inbound") and {"cakecity_mobile_stage", "cakecity_mobile_rider_id"} & values.keys():
            for order in self.filtered("cakecity_mobile_reference"):
                if order.cakecity_mobile_stage in {"preparing", "ready"} and order.cakecity_mobile_kitchen_customer_id and order.cakecity_mobile_plant:
                    self.env["cakecity.mobile.bridge"].with_company(order.company_id)._publish("kitchen_tasks", order.id,
                        {"reference": order.cakecity_mobile_reference, "plant": order.cakecity_mobile_plant,
                         "assigned_to": order.cakecity_mobile_kitchen_customer_id, "status": order.cakecity_mobile_stage})
                trips = self.env["cakecity.mobile.trip"].search_count([("reference", "=", order.cakecity_mobile_reference), ("company_id", "=", order.company_id.id)])
                if order.cakecity_mobile_stage and not trips and order.cakecity_mobile_stage not in {"preparing", "ready"}:
                    self.env["cakecity.mobile.bridge"].with_company(order.company_id)._publish("deliveries", order.id,
                        {"reference": order.cakecity_mobile_reference, "status": order.cakecity_mobile_stage,
                         "rider_id": str(order.cakecity_mobile_rider_id.id) if order.cakecity_mobile_rider_id else None})
        return result


class Lead(models.Model):
    _inherit = "crm.lead"

    cakecity_mobile_enquiry_id = fields.Char("App enquiry ID", copy=False, index=True)
    _enquiry_unique = models.Constraint("UNIQUE(company_id, cakecity_mobile_enquiry_id)", "App enquiry already linked.")
