# Cake City UX and operations round - 14 November 2026

## Owner constraints

Preserve the accepted checkout and Shop visual direction. Adopt the promotion, coupon, progressive-disclosure and loading patterns observed in the owner's Bolt/Uber recordings. Odoo and AI remain paused. Keep isolated zero-payment review separate from production payments. No credentials in source or documentation.

## Requested outcomes and implementation sequence

1. Catalogue and DIY: whole cakes only in DIY, excluding slices/cupcakes/cookies/accessories. Hold products without usable images from public discovery until images are supplied, without rewriting historical order receipts. Use a cake's recipe/appearance as the initial illustrative canvas palette (caramel mainly white), retaining customer colour choice and kitchen confirmation. Correct chocolate flavour matching and carousel flavour labels/order.
2. Customer UX: reduce Home salutation spacing, make offers and available coupons discoverable and attractive, display real savings/eligibility, preserve checkout layout, use existing skeleton loading patterns consistently. Replace verbose tracking refresh action with an accessible in-card icon. Reduce redundant actions and provide contextual shortcuts.
3. Staff speed: preserve web queue position, filters and selections after assignment; avoid full-page reloads. Prioritise a clear next workflow action and compact secondary actions for production, dispatch and riders, with safe bulk handling where transitions permit it.
4. Call centre: dedicated role/workspace for agents, assigned order/inquiry ownership, shared kitchen/dispatch timeline, customer details/receipts, agent attribution and sales/reporting. Enforce permissions and record auditable handoffs. Do not mark an unpaid order paid merely because an agent created or handled it.
5. Marketing: separate native/web module using existing campaigns/coupon APIs where possible; scheduled publication, product targeting, fixed/percentage discounts, limits/expiry and customer eligibility. Server validates actual savings and prevents conflicting/double redemption. Issuing live discounts requires deliberate staff action; no invented campaigns.
6. Corporate visibility: document and expose the existing native portal/web business desk, roles, company assignment, quote/LPO/invoice/payment evidence workflow. Verify actual access rather than claim an unseen UI works.

## Validation and handoff

Record implemented files and actual test results below. Verify catalogue exclusions, image publication rules, flavour matching, discount arithmetic/eligibility, department permissions, queue continuity and mobile typecheck. Preserve unrelated APK/WooCommerce artifacts. Push intended changes once checks pass, distinguish push from Render/device acceptance, and list remaining operational requirements explicitly.

## Progress

- Started from pushed `c312fdf`. Only unrelated untracked APK and WooCommerce artifacts were present.
- Expo v57 reference read as required; installed Expo/Router remains v58.
- Reviewing existing catalogue, coupon, campaign, enquiry and workflow boundaries before adding parallel systems.

## Additional owner steering during implementation

- DIY/Inspo tabs, shorter size/icing selection, green completed steps, predictive flavour search, whole cakes with a strict 2 kg minimum for custom creations. Hard/soft icing choices must come from priced inventory, with unlisted finishes sent for kitchen quotation. Standard shop cakes below 2 kg remain available outside custom creations. Uniform card image frames.
- Real pagination in customer orders, rather than endlessly appending previous pages.
- KRA buyer PIN on receipts, eTIMS integration readiness and Kenya/international data-protection controls. Owner will add operational configuration/keys later; never label the app KRA certified or universally legally compliant without registration, approved integration and review. Consulted KRA system-to-system guidance and ODPC data subject rights.
- Require customer sign-in, retain automatic session restoration, offer optional device biometric unlock and OS password-manager autofill. Do not store raw passwords. Face ID is unavailable in iOS Expo Go; requires a development/installed build. Native shortcuts and a more visible pink installation presence.
- Tie support and dissatisfaction to account plus checkout contacts, distinguish purchaser from delivery recipient, allow scoped contact search and preserve historical records.

## In-progress implementation (not yet release-validated)

New `product_rules.py`, `promotions.py`, `service_desk.py`, `PromotionsShelf.tsx`, `ServiceDesk.tsx`, `MarketingDesk.tsx`, `SizeFinishPicker.tsx`, and web queue-position helper. Existing promotion editor, workspace modules, review seeding, DIY, history pagination, Home greeting, tracking refresh and rider issue actions are being refined. Additive models are registered in main/migration. Tests added in `test_ux_operations.py`; initial new contracts 3 passed, 1 fixture failure (missing test account password hash). Earlier broad selection 18 passed, 3 failures (photo fixtures and admin coupon listing expectations); fixes/rechecks pending. Initial typecheck passed before the latest DIY/history refinements. No commit/push for this round yet.

## Official references

- https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration
- https://odpc.go.ke/rights-of-a-data-subject/
- https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/


## Implemented handoff

### Customer experience

- Whole-cake DIY and Inspo tabs; priced inventory attributes grouped into compact size/finish chips. Custom cakes require a known size of at least 2 kg on both inventory and quote/checkout APIs. Completed steps turn green. Recipe-inspired starting canvas colours remain editable illustrations, subject to kitchen confirmation.
- Public catalogue, DIY and new checkout hide/reject image-less products. Staff inventory and historical receipts remain intact. URL presence/format is checked; this does not prove every remote image is reachable. Supply missing photography in Catalogue management.
- Strict flavour matching, flavour-first deal titles, consistent square product image frames, reduced Home greeting padding, separate rewards-focused Club welcome, customer order pagination (five per page), compact tracking refresh icon.
- Home deal carousel advances every six seconds, pauses during touch and respects reduced motion. Existing confetti/card refill behaviour is preserved.
- Coupons support fixed/percentage/delivery savings, caps, schedules, product IDs, first-order and per-customer limits, and customer segments. Home/Club discover available offers; checkout still confirms all pricing server-side. Native and web discount editors upload banner artwork and show an unsaved customer preview. Content updates after publication/refetch without rebuilding the installed app.

### Staff and company workflows

- Dedicated native/web call centre with assigned cases, priority, scheduled follow-up, purchaser/account/recipient contacts, contact search, linked enquiries, order tracking, internal kitchen/dispatch handoffs, verified receipts and Excel reporting. No call-provider or telephony integration is claimed; phone links open the device dialler.
- Kitchen/dispatch batch transitions accept up to twenty selected orders, return per-order failures and retain failed selections. Web refresh preserves the visible queue anchor, scroll position and open details. Rider secondary issue actions are tucked away.
- Sales reporting is app-only. Website records are retained but excluded. Live monetary reporting uses verified collections less reversals; review purchase frequency does not become collected revenue.
- Native/web Marketing > Audiences: new, first-time, repeat, high-spender, inactive and checkout-pending segments. Defaults: high spender KES 50,000 verified live net spend; inactive after 90 days. Thresholds are configurable. Segment membership can overlap; campaign and coupon eligibility is evaluated on the server. Current audience calculation scans customer/order history; large production datasets need aggregate queries/materialized metrics and load testing before scale-up.
- Admin sees a cross-department operational funnel: quotes, unpaid/confirmed orders, production, dispatch, completion, reviews, enquiries, agent cases, corporate quotes/invoices. Counts include local review and are workload totals, not cohort conversion rates. Admin retains access to department modules and audit.
- Corporate discounts are calculated **per order** on identified whole-cake SKU weight: below 2 kg no discount, 2-5 kg inclusive 5%, above 5 kg 10%. Extras do not receive cake-weight discount. Unknown-weight SKUs need correct inventory attributes. Coupons do not stack with corporate savings.
- Staff-issued quotes appear in the client portal, with notifications. Staff can recall requested/issued quotes before acceptance; accepted/invoiced records require formal correction. Recalled quotes cannot be accepted. Invoices inherit the quote discount snapshot.
- Accepted quotations can enter native checkout inside the corporate portal. Web provides HQ pickup checkout. Native supports the existing pickup/delivery selection. Exact products, prices, quote expiry and duplicate orders are rechecked server-side. Both use existing app order/payment/kitchen/dispatch services. Local zero-charge remains restricted to the isolated review factory. Company order history is available; only the purchaser can open private detailed tracking. Verified live app payments create/reconcile corporate invoice/payment records; no-charge review does not create a monetary receipt in corporate balances. Formal credit notes/refund reconciliation and tax issuance remain operational follow-up, not automatic accounting certification.
- Company logo URL configuration and personalised corporate greeting; Cake City logo added to standard module headers and commercial document printing.

### Authentication, tax and data controls

- Customer sign-in gate with automatic session restoration, OS autofill hints and optional device biometric unlock. Native secure storage contains session tokens/preferences, never raw passwords. Eligible customer shortcuts retain their destination through sign-in. Face ID in iOS Expo Go is unsupported; installed/development build required. OS password saving prompts depend on platform/autofill configuration.
- Android home-screen shortcuts: Orders, DIY, Club and Shop. iOS exposes tracking and reorder shortcuts. Adaptive Android icon background is stronger pink; owner logo assets preserved. A new native build is required for icon, Face ID permission and shortcut changes; an Expo Go reload cannot install these.
- Optional buyer KRA PIN on billing/checkout and receipts; syntax validation is not a KRA identity lookup. Payment confirmation creates a pending tax request. Owner can add/correct their PIN through the protected API until a fiscal invoice is issued. Admin native/web Tax & privacy desk stores operational registration/policy details and handles customer rights requests and responses. Customer Privacy & account includes consent and rights requests plus account export/closure.
- eTIMS is **not connected or certified**. OSCU/VSCU onboarding, approved adapter implementation, tax/item mapping, private configuration, sandbox acceptance and operational/legal review remain required. This round does not claim compliance with every jurisdiction.
- Checkout recovery records activity while the checkout is active, with a one-minute heartbeat. Default reminder delay is an adjustable 30 minutes (a product choice, not a claimed universal industry standard), at most one per customer per UTC day. Opt-in marketing consent is required and rechecked before phone delivery; completed/in-flight payments suppress reminders. Reminders link to the bag for fresh price/stock checks and never initiate payment. Run `python -m app.notification_worker --loop` separately. Phone push requires PUSH_ENABLED/provider/project/device configuration; isolated review forbids remote pushes. Local inbox reminders can still be generated by its worker when privately started with the correct review environment. No SMTP or external marketing channel is configured by this change.

### Verification evidence and remaining acceptance

- Full frontend suite: 234 passed before the final presentation polish; follow-up results recorded below.
- Backend selection: 96 passed covering commerce, permissions, promotions, corporate, DIY, logistics, privacy and notifications before the final corporate invoice reconciliation addition; follow-up results recorded below.
- Headless local Edge: marketing audience display, live unsaved discount preview, admin funnel and Tax & privacy desk passed; no browser exceptions or CSP violations. Desktop and 390px screenshots are ignored local artifacts. Native phone visual/biometric/push acceptance remains unverified.
- iOS Hermes export passed to ignored `artifacts/local-preview/ux-final-ios`; final regenerated bundle result recorded below. Export is not an installed binary or a Render deployment.
- Tests use isolated databases/mocked providers. No live payment initiated. Existing phone Metro on 8084 and original API on 8010 were left running; temporary validation API uses 8910 and will be stopped after QA. Existing preview must be restarted to load new backend modules/tables and seed new department users: Ctrl+C in its terminal, then `npm run start:go:tunnel`. Credentials remain in ignored private preview artifacts.

### Deployment steps

1. Install locked dependencies (`npm ci`) and backend requirements. Back up the hosted database, then run `python -m app.migrate` before starting the updated API. New tables are additive; no customer/order reset.
2. Restart the API and notification worker together on the new revision. Keep zero-charge review settings out of production. Preserve current server-side Pesapal settings; never put secrets in EXPO_PUBLIC variables.
3. Review the app-only sales totals, role access, company membership, inventory photos/weights, corporate discounts and promotion drafts before enabling public issuance.
4. Build/install a fresh native binary for biometrics, permissions, shortcuts and launcher appearance. Confirm checkout through kitchen, dispatch, customer receipt acknowledgement, satisfaction and loyalty on real devices. Render deployment and device acceptance are separate from a verified GitHub push.


## Final verification - 14 November 2026

- Full frontend suite: **234 passed**, rerun on the completed customer/staff screens and navigation changes (`ux-release-frontend.log`).
- Wider backend suite: **96 passed** (`ux-backend-verified.log`). Latest corporate invoice reconciliation, reminder concurrency, privacy and notifications selection: **34 passed** (`ux-latest-backend.log`). One existing Starlette/AnyIO deprecation warning; no test failure.
- Final TypeScript check passed (`ux-release-types.log`). Dashboard JavaScript syntax and staged whitespace checks passed.
- Final iOS Hermes export succeeded: `artifacts/local-preview/ux-release-ios`, bundle `entry-c768e99170dd47d6d9a63ec4b8a75bff.hbc`, 6,809,405 bytes. This local validation export points to the validation API and must not be distributed as a production build.
- Local Edge browser verification passed again (`ux-browser-results.json`), including 390px promotion preview, marketing audiences, cross-department totals and privacy desk, with no runtime exceptions or CSP violations. Private screenshots remain under ignored artifacts.
- Follow-up item: corporate live reversals/credit notes require formal accounting reconciliation; no-charge corporate review intentionally leaves collected balances at zero. Self-service detail tracking is purchaser-owned; other company members see the company order summary.
- Changes are prepared for GitHub. A push does not confirm Render deployment. Native installation and real-device acceptance remain separate.
