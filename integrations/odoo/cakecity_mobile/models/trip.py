from odoo import api, fields, models


class MobileTrip(models.Model):
    _name = "cakecity.mobile.trip"
    _description = "Order-linked mobile dispatch task"

    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    app_task_id = fields.Char(copy=False, index=True)
    reference = fields.Char("App order reference", required=True, index=True)
    plant = fields.Char("Production plant code", required=True)
    rider_id = fields.Many2one("res.partner", required=True, domain=[("cakecity_mobile_rider", "=", True)])
    service_type = fields.Selection([("delivery", "Customer delivery"), ("branch_transfer", "Branch transfer")], required=True, default="delivery")
    resource_type = fields.Selection([("internal_rider", "Internal rider"), ("in_house_driver", "In-house driver"), ("external_rider", "External rider")], default="internal_rider", required=True)
    destination = fields.Char(required=True)
    recipient = fields.Char(required=True)
    phone = fields.Char(required=True)
    items = fields.Json(required=True)
    scheduled_at = fields.Datetime()
    slot = fields.Char()
    pv_reference = fields.Char()
    note = fields.Text()
    proof = fields.Text()
    external_reason = fields.Char()
    status = fields.Selection([(s, s.replace("_", " ").title()) for s in
        ("assigned", "accepted", "collected", "in_transit", "delivered", "failed", "rescheduled", "cancelled")], required=True, default="assigned")
    _app_task_unique = models.Constraint("UNIQUE(company_id, app_task_id)", "An app dispatch task can only be imported once.")

    def _mobile_publish(self):
        for record in self:
            if not record.company_id.cakecity_mobile_enabled:
                continue
            bridge = self.env["cakecity.mobile.bridge"].with_company(record.company_id)
            record.rider_id._mobile_publish_rider()
            order = self.env["sale.order"].search([("cakecity_mobile_reference", "=", record.reference),
                ("company_id", "=", record.company_id.id)], limit=1)
            if order and order.cakecity_mobile_kitchen_customer_id:
                bridge._publish("kitchen_tasks", order.id, {"reference": record.reference, "plant": record.plant,
                    "assigned_to": order.cakecity_mobile_kitchen_customer_id})
            bridge._publish("logistics_tasks", record.id, {"app_task_id": record.app_task_id or None,
                "reference": record.reference, "rider_id": str(record.rider_id.id), "status": record.status,
                "destination": record.destination, "recipient": record.recipient, "phone": record.phone,
                "service_type": record.service_type, "resource_type": record.resource_type,
                "external_reason": record.external_reason or "", "items": record.items,
                "scheduled_at": record.scheduled_at.isoformat()+"Z" if record.scheduled_at else None,
                "slot": record.slot or "", "pv_reference": record.pv_reference or "",
                "note": record.note or "", "proof": record.proof or ""})

    @api.model_create_multi
    def create(self, values):
        records = super().create(values)
        if not self.env.context.get("cakecity_mobile_inbound"):
            records._mobile_publish()
        return records

    def write(self, values):
        result = super().write(values)
        if not self.env.context.get("cakecity_mobile_inbound"):
            self._mobile_publish()
        return result
