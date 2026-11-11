# Feature status

Updated 11 November 2026. "Implemented locally" means source exists; it does not
mean a hosted service, physical device, merchant account or store release has
been verified.

| Area | Status | Evidence and remaining work |
| --- | --- | --- |
| App architecture and navigation | Implemented locally | Expo Router, TypeScript, shared feature modules and five main tabs exist. Verify accessibility and native navigation on devices. |
| Authentication | Partial | Email registration, sign-in, refresh and logout are implemented. Password recovery is implemented locally but disabled until private SMTP configuration is provisioned and verified. Google sign-in remains HTTP 501. Profile editing, account export/deletion and live recovery delivery remain unverified or missing. |
| Catalogue and search | Implemented locally; live boundary limited | Server catalogue/search and product details exist. Do not infer inventory, category coverage, allergens or production availability beyond returned data. |
| Cart, checkout and payments | Implemented locally; production unverified | Server quotes, order creation, Pesapal integration and recovery paths exist in the repository. Real payment account, callbacks, reconciliation, refunds and production fulfillment acceptance remain release gates. |
| Cake customization | Partial | A custom-cake route and enquiry/quotation work exist. Authoritative configurable materials, capacity and dynamic production pricing require backend/business validation. |
| Orders and tracking | Implemented in current worktree; deployment unverified | Existing order details are extended with delivery milestones and rider position. The tracking map endpoint and migrated schema must be present in the deployed service. No invented ETA or background tracking is claimed. |
| Rider and dispatch | Implemented locally; operational acceptance pending | Kitchen, dispatch, rider assignment and status workflows exist. Branch scopes, real rider accounts, proof-of-delivery policy and staff permissions require acceptance testing. |
| Club / loyalty | Partial | Membership and rewards surfaces/back-end behavior exist. Confirm ledger ownership and Enquest/Odoo authority before changing or synchronizing records. |
| AI concierge | Paused | Current UX hides the entry and redirects the route. Keep provider disabled until billing, privacy, limits and release acceptance are approved. |
| Corporate commerce | Partial | Corporate/workspace functionality exists in the repository; the full approval, credit, invoicing, branch fulfillment and reporting requirements are not complete. |
| Notifications and marketing | Partial | In-app/transactional infrastructure exists. Device push delivery and marketing consent/campaign outcomes need provider and device verification. |
| Administration | Implemented locally; production readiness unverified | Dashboard and operational tools are present. Validate role/branch isolation, audit coverage, backup/recovery and deployed configuration. |
| Receipts and tax | Partial | Order/payment receipts exist. Do not represent a standard receipt as a compliant Kenyan fiscal invoice; eTIMS requirements remain external. |
| iOS / Android native capabilities | Not verified | Configuration and native shortcut sources exist. Signed-device tests are required for Siri, permissions, location, push, sharing and app lifecycle. |
| Analytics / personalization | Partial | Local performance/commerce instrumentation exists. Reconciled business reporting, consent, attribution and recommendation quality remain open. |

## Highest-priority blockers

1. Password recovery requires configured, verified SMTP delivery; Google
   identity remains unavailable without provider credentials/account-linking
   policy.
2. Production payment, fulfilment and privacy behavior must be checked against
   the real deployed API using dedicated test accounts.
3. Current tracking changes need deployed-route and schema verification plus
   two-account device testing.
4. The overall master enhancement brief remains incomplete.
