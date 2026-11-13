# Cake City ecosystem expansion - 13 November 2026

## Owner request and continuity

Preserve the existing Shop direction, payment confetti and Club card refill. Improve Club chapter colours, Profile and short checkout. Add auditable rider earnings/payment reports for rider, dispatch and admin; staff-managed corporate onboarding, CRM, quotes, LPOs and payment records with client isolation; inventory-priced playful DIY with an illustrative cake canvas. Odoo and AI remain paused. Local review stays no-charge; production payment rules remain separate.

## Implementation order

1. Read logistics source and current models/permissions; retain owner workflows. Document pricing uncertainty before any payout calculation.
2. Add backend persistence and permissions for earnings and corporate CRM/commercial documents. Server owns prices and statuses; payment evidence is not proof of settlement. Never let clients mark themselves paid or access another company.
3. Add native staff/client screens and web dashboard sections for those APIs. Department users stay in native screens; website users stay on the website. Add Excel-compatible report exports with server-side role/date filters and formula-injection protection.
4. Make DIY use published catalogue/configuration choices and validated server quotes, with a live illustrative cake preview, clear selection progress, reversible changes and reduced-motion support. Do not invent inventory, topping prices, availability, or promise an exact finished cake.
5. Refine Club chapters/celebration/card refill and Profile. Collapse checkout upsells behind a compact optional control.
6. Validate permissions, monetary arithmetic, idempotency, business transitions, report contents, customer flows, typecheck and iOS bundle. Record exact evidence and unfinished external configuration before push.

## Source constraints and decisions

Source: `C:/Users/Web Design/Downloads/Logistics Documentation.docx`. Its Odoo implementation instructions describe the original intended system; this task implements independent app equivalents, with Odoo deferred by the owner.

Section 19 clarifies the earlier section 7 ambiguity. Owner then explicitly confirmed in chat: **customer delivery `max(KES 100, distance_km * KES 30)`; rider delivery `KES 85 + distance_km * KES 15`**. These supersede earlier customer base-plus-distance assumptions. Pickup/external/special/zone scenarios also contain TBDs and require explicit tariff approval. Keep historical quoted tariff snapshots immutable; missing distance cannot be treated as zero-distance approval.

Rider payout states should distinguish estimated, earned (trip delivered), approved, partially paid and paid. Dispatch/admin record payments with reference/date and audit trail; recording payment does not move money. Rider can see only own trips and payments. Reports reconcile approved earnings, payments and remaining balances without counting cancelled trips.

Corporate additions: assigned manager/assistant/agent, client contact/company record, account membership, CRM stages/notes/follow-up, authored activity, versioned line-item quotes with expiry/acceptance, LPO reference and attachment/evidence references, invoice/payment allocation and outstanding balance, administrator overview. Existing accounts/invitation security should be reused. Corporate credit and tax invoicing must not be claimed enabled automatically. Sharing creates a shareable document for the user to send; no unsolicited email/messages.

## Progress

- Baseline: GitHub master `5797bae`; no tracked changes before this task. Preserve unrelated APK and WooCommerce integration artifacts.
- Exact Expo v57 documentation read as required by AGENTS.md; installed dependency version must remain authoritative for implementation details.
- Local review checkout repair already shipped; do not reset its orders, accounts, catalogue or settings.
- Implementation and verification entries will be appended as work completes. This document is a continuation plan, not a claim that all modules above are already complete.

## Added owner refinements

- Native geolocation and delivery tracking, polished customer orders, quiet nonblocking notifications; Pink Simba image should now fill the carousel (cover).
- Pickup branches in a searchable popup; Athi River merged into Embakasi. Remove Athi River from new choices while retaining historical orders.
- Welcome first-order coupon explicitly approved: **KES 100 off**. Eye-catching ticket artwork and brief confetti; checked opt-in selects it at checkout, optional dismiss saves it for later. Owner wants this tested with the isolated zero-payment flow. Referral points/coupon conversion must continue to work and prevent duplicate awards.
- Finish functional paths before shared premium UI refinements; avoid multiplying panels or lengthening checkout.

## Implementation

New backend modules: `ecosystem_models.py` (additive tables), `rider_earnings.py`, `business.py`, `excel_report.py` (dependency-free XLSX table response), `diy.py`. Main and migration register them. Rider fare estimate/approval/partial-payment recording, per-company CRM, onboarding, staff assignment, quote acceptance, LPO references, invoices, evidence verification, private print documents and Excel reports are implemented on shared native/web APIs. Corporate evidence supports private, immutable PDF/JPEG/PNG files up to 2 MB; native upload currently selects receipt/LPO photos, while web also uploads PDF files. Payment evidence is manually verified and does not charge money or settle itself.

New mobile components: `EarningsPanel`, `BusinessPortal`, `InventoryStudio`/`CakeCanvas`, `WelcomeCoupon`, `PickupBranchPicker`, `DeliveryAddressLocation`, report sharing helper. Staff/rider/dispatch entries wired; corporate route renders BusinessPortal; custom tab renders InventoryStudio. API client now supports authenticated text/byte exports with existing refresh/account isolation. Checkout includes optional coordinates/branch selection, sole-zone auto selection and explanatory disabled states. Existing paid confetti/refill preserved; chapters selectable with membership palettes. Pink Simba cover and collapsed filled-bag upsells applied.

Customer tracking now includes each task's rider name, phone and role, separate from private account fields. New order snapshots include product photos. A live rider position is shown only when shared for the authorized trip; a manually captured checkout pin is retained separately from a priced Maps route. Existing historical orders and charges are not rewritten.

Receipts use the supplied PNG logo embedded as a data URL for offline PDFs, item details, contact/fulfilment details, savings, separate order value and collected amount, and an explicit eTIMS limitation. Review receipts show KES 0 collected, without an unnecessary sandbox banner; real sandbox/test and reversed-payment documents remain identified. An illustrative, non-order receipt PDF/PNG was rendered locally in Edge and visually inspected; this does not prove native print behavior.

## Access and operation

- Native dispatch and riders: expand Earnings & payment history or open Rider earnings & payments in the workspace. Admin and finance have an earnings module too. Confirm actual road distance when a priced route is unavailable; approve only delivered trips, then record completed payments with references. Confirmed Maps routes automatically seed standard internal-rider estimates. Pickup/special/external resources remain tariff pending.
- Corporate manager/assistant creates a client from Corporate CRM & accounts; agents see assigned companies. Existing account passwords are preserved. New client access is provisioned as `corporate_client`; the client lands in `/corporate`, with no product storefront. Private server command `python -m app.manage_staff --email <staff-email> --role corporate_manager` (or `corporate_assistant`, `corporate_agent`) grants staff roles to existing accounts. Do not put passwords in this command or the docs.
- Web: `http://localhost:8010/admin/`; client portal alias `http://localhost:8010/business/`. Corporate client logins open their company desk. Shared shell assets remain same-origin and role APIs enforce access independently.
- Welcome: KES 100 first-order coupon, once per account, selected at checkout only after the user opts in. It cannot be combined with a second coupon. Completing review orders consumes coupons normally without contacting a payment provider. Referral points are awarded on completed eligible deliveries and existing Club reward redemption converts them to app coupons; duplicate completion events cannot award twice. Existing qualifying threshold/annual limit are retained.
- DIY uses actual priced cake variations and separate inventory extras. It preserves SKU, selected size, message and requested colour through bag and checkout. Saved creations remain in the account-scoped device sketchbook and are checked against current inventory before restoring. Colour canvas is illustrative; unavailable icing/decor and unpriced production work still require a custom kitchen brief. Do not invent missing inventory prices or describe all unconfigured bespoke work as automatically purchasable.
- Restart Expo via `npm run start:go:tunnel`; existing review DB, credentials and orders remain in ignored local artifacts. Production uses `app.start` migration to add tables; normal start without migration must not be treated as a verified Render deployment.

## Verification and limits

- Frontend full suite: **232 passed**. Follow-up receipt/checkout/Club/workspace selection after later refinements: **14 passed**. Final typecheck passed. A further 12 receipt/checkout/workspace tests passed after restoring the DIY sketchbook and simplifying the corporate entry screen.
- Backend broad selection: **106 passed**, with two outdated module-list expectations failing because rider/driver now legitimately have Earnings. Updated those expectations, reran those two tests: **2 passed**. Additional completed-review referral-to-redeemable-coupon test: **1 passed**. Initial DIY/welcome/business/tariff/coupon selection: **20 passed**. Includes actual table ZIP/XML integrity and no-formula cell checks, role/owner isolation, payment approval/overpayment protection, verified-evidence boundaries, one-use welcome redemption at KES 0 collection, branch merge and customer coordinate validation.
- iOS Hermes export passed: `entry-f3718ec058a287eb0f6e55878f09596e.hbc`, 6.7 MB, ignored `artifacts/local-preview/ecosystem-ios-final`, including the final sketchbook and corporate entry changes.
- Running isolated API smoke checks: admin/dispatch/rider earnings and Excel return 200; customer payout access returns 403; native DIY inventory returns 40 actual product choices; branch directory returns 12 branches with no separate Athi River; admin JS/CSS assets return 200. After refreshing the owned backend, both `/admin/` and `/business/` return 200. All check login sessions were logged out; no new business orders/payments were submitted.
- Browser REPL was unavailable. Receipt was rendered and inspected using local Edge headless. No browser acceptance for the native UI or authenticated portal, physical-phone location/printing/notification delivery, or live Render deployment is claimed. Review disables paid Maps, payment providers, SMTP/remote push, Odoo and AI. Destination GPS capture and in-app inbox work independently; paid road routing and remote push still need private service configuration and device validation. No real rider transfer or corporate payment was initiated.

## Remaining operational acceptance

On iPhone, check Home welcome coupon once/dismiss/apply, zero-payment checkout, branch popup at small/large text sizes, location allow/deny, cake playground combinations and price changes, Club refill/confetti with Reduce Motion, per-delivery rider cards, receipt PDF/logo and private document sharing. In web, check manager onboarding, assigned-agent isolation, client quote approval, LPO upload, invoice/evidence reconciliation and Excel export. Confirm production Maps/remote push configuration before claiming those services live. Unapproved special/pickup rider tariffs need business approval; no invented payable amount is used.

## DIY opening repair - 13 November 2026

Owner reported tapping DIY left the screen unchanged. Installed Expo Router 58 maps tab `href: null` to `hidden: true`; `useVisibleTabsWithRedirect` immediately replaces a focused hidden route with the initial tab. Both custom and search had that obsolete configuration. Removed `href: null` from these two declared screens. The app already renders its own FloatingTabBar and disables the navigator tab bar, so neither creates an extra bottom navigation item. Existing DIY links and screen stay intact.

`tests/diy-navigation.test.cjs` exercises the actual installed TabsClient conversion and visible-tab redirect hook. It reproduces the old custom-to-index redirect and verifies both repaired routes remain focused. Combined navigation and Home search tests: 5 passed. Local inventory API and the active Expo review proxy each returned 200 with 40 cakes. A browser check could not finish loading the development web bundle; native inspector access closed before responding. No phone tap verification is claimed. Reload Expo Go to discard the old navigator state.
