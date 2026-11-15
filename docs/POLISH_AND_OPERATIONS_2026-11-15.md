# Polish and operational follow-through

Owner authorisation: enhance the accepted UI without replacing its layout. Implement the preceding recommendations plus compact coupons, selectable Club points, wheel-style date/time controls and improved form/search placement. Preserve isolated review payments, account isolation, dispatch-only capacity overrides, and the paused Odoo/AI integrations.

## Implementation order and continuation checklist

- [x] Recover a transient public tunnel loss in the existing Expo process. Preserve explicit quit and bounded fallback for actual failures.
- [x] Compact coupons, including the restored pink gradient header, and one-tap checkout selection.
- [x] Select Club redemption amount with a wheel, value/minimum-order preview and idempotent retry.
- [x] Native date/time wheels, form surfaces and fixed DIY search controls. Preserve accepted shopping layouts.
- [x] Focus customer journeys with contextual actions and progressive disclosure.
- [x] Full-slot notification waiting list without reserving capacity.
- [x] Versioned custom design approval before production, with customer/staff ownership and audit.
- [x] Verified handover/delivery codes; retain customer acknowledgement and feedback.
- [x] Staff-maintained verified product facts without inferring recipe safety from names.
- [x] Corporate purchasing roles and approval limits enforced on the server.
- [x] Optional journey measurement with consent, bounded collection and aggregate reporting.
- [x] Permission/ownership/retry tests, typecheck, browser layout checks and iOS bundle export. Device and hosted acceptance remain separate below.

## Findings

The previous review supervisor restarted Expo immediately on a tunnel closure message. The launcher now first reconnects ngrok within the same Expo process, allowing a short transient disconnect to recover without discarding Metro. Repeated recovery failures still use a bounded fallback. Recovery and explicit-stop behaviour have automated tests; a real outage was not forced during the owner's testing.

Club redemption now accepts 1–500 points, within the member's available balance and the server's configured minimum. Monetary value and minimum-basket rules remain unchanged. A pending request keeps its amount and idempotency key through ambiguous failures, preventing a retry from spending twice.

## Customer presentation

- Smaller coupon sheets/cards retain readable terms and the previous pink header. Checkout shows the best/selected offer first, with other offers disclosed on demand. Empty coupon sections and technical sync wording are removed.
- The header opens **Your kind of celebration**. Its Plan tab contains the happy-moment planning card, removing the duplicate Home section.
- Club colour preferences now have switches for Home, Shop, Orders, Profile, DIY, checkout and celebration pages. Preferences are stored privately per account on this device. The Club toggle remains independent. Staff/authentication screens and high-contrast accessibility mode keep their own treatment.
- Payment and reward celebrations have three waves of 140 particles over nine seconds, with a gentler fall. Reduced-motion handling remains supported. Welcome artwork uses a smaller burst.
- DIY tabs, steps, cake stage and flavour search stay outside the scrolling choices. The actual product photo and a rotatable, offline 3D **design illustration** are separate views. Caramel styling, icing colour, piping and a ring of candles respond to the design.
- The 3D illustration is original procedural geometry, not an exact Cake City scan or a promise of hyperrealistic output. Matching photogrammetry/artist models are still needed for exact flavour-specific realism. No third-party cake model was downloaded or incorporated.

## Operational follow-through

New endpoints are under `/v1/journey`; related slot endpoints remain under `/v1/experience`, and corporate purchasing controls under `/v1/business/companies/{id}/purchasing`.

- Custom designs: staff publish a versioned design with an optional validated photo; the owning customer approves or requests changes. Preparation is blocked until the current required design version is approved. Staff have plant/assignment/case scope checks.
- Handover and delivery: time-limited QR/manual codes are scoped to a task revision. Rider transitions require the code once issued. Reassignment invalidates it, attempts are bounded, and existing audited staff exception paths remain. A delivery code does not automatically acknowledge customer receipt or submit a rating.
- Full slots: customers can ask for an availability notification. Release/capacity changes can notify them once per waiting revision. The notification does not reserve a place. Only Dispatch Manager retains the existing capacity override right.
- Product facts: authorised staff enter verified ingredients, allergen/handling information and a source before publication. Public responses exclude the internal source. Do not invent allergen-free claims from a flavour name.
- Corporate purchasing: authorised managers/company owners set existing members' buyer/approver/viewer roles and per-quotation approval limits. Approval is checked on the server, and requesters cannot raise their own authority.
- Measurement: optional opt-in events contain only an allowed event name, deduplication ID and image timing where applicable. No search text, image URLs, contact or payment metadata is collected. Live/development summaries are separate; independent stage counts are not represented as a sequenced sales conversion rate. Revocation/account closure deletes records. An hourly cleanup removes signals older than 30 days and expired verification records.
- Native **Tools & insights** and the web Service & growth workspace expose the staff tools. Corporate purchasing controls are available in both clients.

## Running and release notes

Keep using `npm run start:go:tunnel`. A launcher that was already running before these script changes needs one normal restart to load the tunnel recovery code; no repeated cache clearing is required. Validation used a separate database copy/API/Metro, preserving the owner's review data and Expo process. The review API was started when its port was free.

Version is **0.3.4**, native build **20**. The added `expo-camera` module is for rider QR scanning with camera permission on demand; microphone access is disabled. An installed development/production app needs a new native build for this dependency. Expo Go must match the installed SDK (this repository currently uses Expo 58). The requested versioned Expo 57 documentation was consulted before coding; no SDK migration was performed.

Render's existing `python -m app.start` startup runs migrations before serving. Install the updated backend requirements, including `qrcode`. No production payment/provider settings were changed, and no real charge, payout, refund or outbound campaign was executed. AI and Odoo remain paused.

## Delivery evidence

- Frontend: **256 tests passed** (`npm test`).
- TypeScript: `npm run typecheck` passed.
- Backend operational regression pass: **95 passed** across journey, slots, logistics, corporate, earnings, privacy, Club and workspace suites. Follow-up after the purchasing-key/retention changes: **12 passed** in journey/privacy, then **8 passed** in journey including retention and the PostgreSQL policy-key length guard. The existing Starlette/httpx deprecation warning remains.
- iOS Hermes export succeeded at `artifacts/local-preview/polish-complete-ios` (local build artifact only).
- Browser checks cover mandatory sign-in, the header/Plan flow, page-colour selectors, the points wheel, and a fixed DIY stage with no horizontal overflow at 320/390/430px. Gold/points were response fixtures against a private database copy, not changes to the owner's real wallet.
- Private logs/screenshots are under ignored `artifacts/local-preview/polish-*`; credentials and the validation database are not deliverables or Git content.

Still requires acceptance on a physical phone: camera scanning, native WebView 3D gestures, native date/time wheels, animation performance and biometric flows. Remote push/email delivery depends on configured providers and has not been proven by these local checks. Exact hyperrealistic cake assets and hosted Render deployment verification remain outstanding.
