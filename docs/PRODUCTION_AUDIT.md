# Production rebuild audit — 10 September 2026

## Evidence and scope

The audit below was recorded before the resumed work. The referenced sibling
backend is no longer present at that path in this workspace; its deployment
cannot currently be verified. Current source, checks and remaining dependencies
are documented in `REBUILD_STATUS.md` and `API_INTEGRATION.md`.

Audited all app routes, shared components, API modules, domain models, storage,
assets, package/configuration files, native Android configuration, iOS activity
sources, release scripts and previous build logs before significant changes.
Baseline `npm run typecheck` passed. Existing uncommitted changes are preserved
in `.rebuild-backup/` before replacing the monolithic storefront.

Read the exact Expo 57 documentation. The supported baseline is React Native
0.86, React 19.2.3, Node >=22.13, Android 7/API24+, compile/target API36,
iOS16.4+ and Xcode26.4+. Store submission requirements must be checked at release.

## Actual findings

- The visible 1,674-line home route owns its own WooCommerce catalogue and bag.
  Checkout only displays an unavailable/preview message. Preview customers,
  fabricated orders and points are reachable from authentication screens.
- Separate commerce wrappers call routes and shapes that do not match the
  backend. The adjacent `../Cakecity/backend/api/app` was inspected read-only.
- Actual payment: POST `/v1/payments/intents`, `Idempotency-Key`, M-Pesa STK /
  Flutterwave hosted card checkout; GET `/v1/payments/intents/{id}` with
  `X-Payment-Secret`. The server creates/reprices the order. Provider callbacks
  determine paid status. These providers and callbacks must be preserved.
- Actual checkout quote: POST `/v1/checkout/quote`. It supports product slugs,
  quantities, sizes 1kg/1.5kg/2kg, a message and named add-ons. It currently
  applies fixed delivery fees and silently ignores coupons. Those limitations
  cannot be fixed by client-side calculations.
- Actual account routes are under `/v1/account/`: orders, saved, addresses,
  rewards, moments and notifications. Refresh tokens rotate, but the old client
  did not refresh expired access tokens and deleted sessions on network failure.
- Backend catalogue uses `/v1/catalog/products` and detail by slug. It lacks
  categories, variations and branch filters. The public WooCommerce Store API
  remains the real source for paginated catalogue/category browsing.
- Missing backend functionality: password recovery/reset, configurable Cake
  Studio materials/quotes, branch discovery/capability, route-based delivery
  pricing, verified coupon application, mobile device push registration, profile
  updates and account deletion. Native Live Activity files have no linked target.
- `.env.local` points at phone-local `http://127.0.0.1:8000`; Google IDs are absent.
- Previous Android failures are AccessDeniedException in OneDrive native outputs.
  The old rebuild script silently continued after failures and could copy stale
  APKs. EAS production was incorrectly configured to emit APK rather than AAB.

## Implementation approach

Retain Expo Router, strict TypeScript, secure native storage, existing brand
assets, reusable UI, TanStack Query and the existing server payment providers.
Separate feature screens from validated API contracts. Use real public catalogue
data; no seeded commerce or customer records. Missing backend capabilities return
actionable unavailable states. Never authorize a charge from an unverified price,
expired quote, unsupported variation, missing delivery quote or unconfirmed coupon.

See `API_INTEGRATION.md` for the verified contracts and additive backend work.
An APK is a test artifact, not evidence that external services are deployed.
