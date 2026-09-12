# Native rebuild handoff

Updated 11 September 2026. This document describes the current native application;
older web-preview and device screenshots are historical artifacts.

## Delivered source

- Five persistent Expo Router tabs: Home, Shop, Custom, Orders and Account.
- White/blush Cake City surfaces, shared typography/spacing, accessible actions,
  platform safe areas, haptics, reduced-motion handling and error/loading states.
- Real paginated WooCommerce catalogue, search, category hierarchy, sale/price
  filters, product variations, related accessories, recent views and favourites.
- Persisted bag with separate configuration identities and server quote checks.
- Native checkout with saved addresses, pickup/delivery selection, GPS delivery
  quote boundary, coupons and the existing payment intent/status protocol.
- Secure payment recovery, idempotency across interrupted requests, server-only
  success confirmation and persistent, repeat-safe purchased-item cleanup.
- Layered Cake Studio with configured options, live estimates, incompatibility
  checks, expiring server quotes and local saved designs separated by account.
- Authentication, token rotation, secure storage, logout, recovery/reset screens;
  account addresses, order history/tracking/reorder, rewards, celebrations and inbox.
- Android APK generation and verification script; EAS AAB/IPA profiles and
  Codemagic iOS release checks.

## Architecture

`app/` contains route entry points and small feature screens. Larger screens live
in `src/features/{auth,commerce,studio,account}`. TanStack Query owns remote state;
Zustand stores the local bag and preferences. Shared UI is in
`src/components/ui/Commerce.tsx`, with tokens in `src/theme/tokens.ts`.
`src/api/client.ts` handles timeouts, errors and bearer refresh; validated commerce
contracts and payment recovery are separate from presentation. Existing provider
endpoints remain intact. Native capabilities live in `src/native/`.

## External dependencies and limits

The deployed account/commerce API URL has not been supplied for this build.
The workstation's previous `127.0.0.1` address cannot serve a release app on a
phone. An APK without that URL can browse the public catalogue; authenticated
commerce services remain unavailable. This is not a production launch sign-off.

See [API_INTEGRATION.md](API_INTEGRATION.md) for the exact client contracts and
missing backend capabilities. In particular, distance delivery, verified
promotions, custom cake quoting/materials, password recovery and native push
require deployed server support. Real authentication and provider callbacks
cannot be certified by mocked contract tests.

Saved Cake Studio designs are device-local. Delivery currently uses GPS at the
destination and opens server-provided courier coordinates in the maps app.
There is no linked iOS Live Activity extension target; the reference Swift sources
are not a shipping Dynamic Island implementation. Profile editing and account
deletion are not implemented. Confirm those backend and store-release requirements
before public distribution.

## QA evidence

- Baseline and revised TypeScript checks passed.
- 19 targeted tests passed: quotes/money, configurations, promotion eligibility,
  payment handoff, refresh concurrency, logout, durable recovery, corruption,
  exactly-once bag cleanup, production environment validation and real WooCommerce
  wildcard variation attributes.
- Expo dependency compatibility and formatting checks passed.
- PowerShell build script parsed without errors.
- Android release build succeeded on 11 September 2026. The verified artifact is
  `dist/CakeCity-0.2.0-preview.apk` (71,452,579 bytes), version 0.2.0 / code 2,
  package `ke.co.cakecity.mobile`, ARM64 and x86_64. Its signature and embedded
  JavaScript bundle passed verification; the copied file has SHA256
  `6EA51D976FF9B29C7390ADF9BED01CDB644FA741DE2526B3F8F9283BA7BDDAAB`.
- The Windows build required a working portable JDK 21, a short staging path,
  and regeneration of a modified Gradle transform cache entry. The script now
  checks the Java runtime and APK bundle, and defaults to `C:\CakeCityBuild`.
- No Android handset was connected at the initial device check. Installation on
  the customer's phone, native lifecycle/background behavior, push delivery and
  the iOS build require separate device/cloud verification.

## Final launch checklist

- [ ] Set and verify the real HTTPS API, then build again with that environment.
- [ ] Resolve the remaining upstream issues in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md), including the URL-decoder advisory.
- [ ] Verify every required capability and actual Cake City business rule.
- [ ] Complete real test-account registration, login, restart and reset flows.
- [ ] Validate stock, variation, studio, coupon and delivery repricing on the server.
- [ ] Exercise provider sandbox callbacks, failed payments and lost responses.
- [ ] Confirm authenticated order ownership, tracking, reorder and loyalty.
- [ ] Verify device-token lifecycle, consent and delivered notifications.
- [ ] Test Android installation, cold start, links, back navigation and accessibility.
- [ ] Generate a signed iOS archive on macOS/EAS and test through TestFlight.
- [ ] Supply production signing, privacy/store metadata and account-deletion support.
