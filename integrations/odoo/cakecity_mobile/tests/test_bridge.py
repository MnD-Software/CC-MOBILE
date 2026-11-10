from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMobileBridge(TransactionCase):
    def setUp(self):
        super().setUp()
        self.bridge = self.env["cakecity.mobile.bridge"].sudo()
        self.company = self.bridge.env.company
        self.company.cakecity_mobile_enabled = True

    def test_contract_and_customer_event_idempotency(self):
        self.assertEqual(self.bridge.capabilities()["contract"], "cakecity-odoo-v1")
        event = {"event_id": "odoo-native-test-customer", "kind": "customer.changed", "aggregate": "native-test-buyer",
            "occurred_at": "2026-11-10T10:00:00Z",
            "data": {"id": "native-test-buyer", "first_name": "Integration", "last_name": "Test", "email": "test@example.invalid"}}
        self.assertEqual(self.bridge.apply_event(event)["status"], "accepted")
        self.assertEqual(self.bridge.apply_event(event)["status"], "duplicate")
        self.assertEqual(self.env["res.partner"].search_count([("cakecity_mobile_customer_id", "=", "native-test-buyer")]), 1)
        event["data"]["first_name"] = "Conflicting"
        with self.assertRaises(ValidationError):
            self.bridge.apply_event(event)

    def test_feed_deduplicates_unchanged_records(self):
        first = self.bridge._publish("riders", "native-test-rider", {"name": "Test", "phone": "0712345678", "active": True})
        second = self.bridge._publish("riders", "native-test-rider", {"name": "Test", "phone": "0712345678", "active": True})
        self.assertEqual(first.id, second.id)
        page = self.bridge.changes(after=first.id-1, limit=1)
        self.assertEqual(page["data"][0]["record_id"], "native-test-rider")

    def test_public_user_has_no_bridge_access(self):
        bridge = self.env["cakecity.mobile.bridge"].with_user(self.env.ref("base.public_user"))
        with self.assertRaises(AccessError):
            bridge.capabilities()

    def test_reward_deducts_native_card_once(self):
        currency = self.env["res.currency"].with_context(active_test=False).search([("name", "=", "KES")], limit=1)
        self.assertTrue(currency)
        currency.active = True
        program = self.env["loyalty.program"].create({"name": "TEST App Loyalty", "program_type": "loyalty",
            "company_id": self.company.id, "currency_id": currency.id})
        partner = self.env["res.partner"].create({"name": "TEST App Member", "company_id": self.company.id,
            "cakecity_mobile_customer_id": "native-test-member", "cakecity_mobile_tier": "Silver"})
        card = self.env["loyalty.card"].create({"partner_id": partner.id, "program_id": program.id, "points": 300})
        self.company.write({"cakecity_mobile_program_id": program.id, "cakecity_mobile_rewards_enabled": True,
            "cakecity_mobile_point_minor": 100, "cakecity_mobile_minimum_points": 100,
            "cakecity_mobile_minimum_multiple": 10, "cakecity_mobile_reward_days": 90})
        first = self.bridge.club_redeem("native-test-member", 100, "native-test-reward-key")
        second = self.bridge.club_redeem("native-test-member", 100, "native-test-reward-key")
        self.assertEqual(first["code"], second["code"])
        self.assertEqual(card.points, 200)
        self.assertEqual(first["amount_minor"], 10000)
