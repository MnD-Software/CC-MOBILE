Cake City Mobile Integration for Odoo 19
=======================================

Install this addon into the Odoo 19 server hosting the cake-demo database.
The delivery archive includes ODOO19_SETUP.md with installation, API-key,
company configuration, synchronization, acceptance tests and known limits.

This addon uses native products, pricelists, contacts, sales, loyalty cards and
loyalty history. It adds an idempotent integration journal, versioned change
feed, app reward conversion and explicit rider/fulfilment fields.

The connector and scheduled reconciliation start disabled. Order confirmation
is opt-in and requires matching totals. Pesapal evidence is not an accounting
payment entry. Native invoices, journals, fiscalization and refunds continue
to follow the configured Odoo business workflow.

The module has not been installed or run on cake-demo by this delivery.
Run its bundled Odoo TransactionCase tests before enabling synchronization.
