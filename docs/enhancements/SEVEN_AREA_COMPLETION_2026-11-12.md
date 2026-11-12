# Seven-area finishing pass — 12 November 2026

Release: mobile 0.3.3, Android/iOS build 19. Preserve the approved Oraimo/Carrefour Shop sidebar. AI remains paused.

## Implementation and acceptance boundaries

| Area            | Implemented                                                                                                                                                                              | Remaining production acceptance                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Checkout        | App-owned quotes/orders, Pesapal recovery and reconciliation, duplicate-attempt protection; local no-charge checkout verification                                                        | Confirm current Render release, private Pesapal/IPN setup and one owner-operated real transaction               |
| Dispatch        | Assignment, kitchen readiness, customer order timeline/map, explicit foreground GPS; new optional background GPS with revocable trip-only credentials                                    | New native build, real rider/customer phones, outdoor route and locked-screen verification                      |
| Notifications   | Durable account inbox, foreground alerts, transactional push queue/worker, preferences and a phone delivery self-test                                                                    | Push credentials/native entitlements and running worker; user confirms only Pesapal is configured               |
| Performance     | Virtualized catalogue and cached image loaders retained; inactive product, inbox and support screens stop unnecessary fetching/polling; existing bounded timing instrumentation retained | Representative low-end Android and iPhone release-build timings; local browser results are not phone benchmarks |
| Shop            | Approved vertical category rail and product grid preserved; existing predictive search, image placeholders and product interaction checks retained                                       | Owner review of new native build                                                                                |
| Club            | Membership card retained, visible next reward/progress, confirmation before redeeming points; pending redemption recovery retained                                                       | Real loyalty credit after confirmed payment and owner visual acceptance                                         |
| Account/support | Profile editing, authenticated private JSON export, password-confirmed account closure, session/push revocation, owned-order support/refund requests with staff replies                  | SMTP account and verified sender for email recovery; operational support/refund handling                        |

## Render API

Keep the existing production database; take a database backup before release. `python -m app.start` runs additive schema creation before starting HTTP workers. This release adds `closed_accounts`, `order_support_links` and `rider_tracking_grants`; it does not reseed production data.

Read-only verification after deployment:

```powershell
cd backend
..\.venv\Scripts\python.exe verify_deployment.py https://cc-mobile-1.onrender.com
```

An authorized staff/admin token can read `GET /v1/admin/release-readiness`. It reports configuration flags and queue counts, never credentials and never charges a payment. A configured flag is not proof of provider delivery. Do not post credentials, account tokens or the response's customer-specific information in public logs.

## Enable password recovery privately

Set Render API variables `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS, or your provider's supported setting), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SENDER_EMAIL`, and optionally `SMTP_SENDER_NAME`. Verify the sending domain/address with the mail provider. Then set `PASSWORD_RECOVERY_ENABLED=true` and redeploy. The server refuses production startup if recovery is enabled with missing/invalid sender settings.

Test requesting a reset for a dedicated account, receiving the email, using the code once, expiry/reuse rejection and signing in with the new password. Recovery must not reveal whether an email is registered. Keep the flag false until mail setup is complete.

## Enable phone push privately

1. Configure the project's Android FCM v1 credentials and Apple push entitlement/key through EAS. Install a native development/preview or production build; browser inbox checks do not verify remote phone alerts.
2. Deploy the API/migrations, then create the optional worker from `backend/render-notifications.yaml` or run `python -m app.notification_worker --loop` on an equivalent persistent worker.
3. Give worker and API the same **private production** `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` and, where enhanced Expo push security is enabled, `EXPO_PUSH_ACCESS_TOKEN`. Never put these in `EXPO_PUBLIC_*` variables. A separate Render worker may incur hosting charges; creating this file does not provision one.
4. Set `PUSH_ENABLED=true` on both services once credentials are configured. The default remains false. API inbox events persist even when remote push is disabled.
5. On the installed phone sign in, enable notifications and tap **Send a test notification**. Move the app to the background. Queued is not delivered: inspect `GET /v1/admin/notifications/status`, worker receipts, then confirm an actual phone alert. Repeat with preparation, kitchen-ready, dispatch and delivery events. Test logout, permissions denied and disabled preferences.

## Background GPS acceptance

Build 19 introduces a native module and background permissions; an OTA update to an older binary is insufficient. Riders must collect their assigned cake, then choose **Share while navigating** and explicitly grant background location. Customer checkout still requests foreground location only.

The phone stores a revocable location-only credential, bound to that rider's refresh session and one assigned trip, for at most eight hours. It cannot read account data or other deliveries. Refresh rotation retains the binding; logout invalidates it. Stop, revoked access, reassignment, terminal trip state and expiry prevent further updates. Inaccurate/stale fixes are rejected, and customer markers expire rather than pretending movement.

Verify outdoor movement, navigation to another app, locked phone, loss/recovery of network, collection/delivery transitions, reassignment, logout and denied permissions on both Android and iOS. Force-quitting and device battery restrictions can stop location delivery; this is disclosed to the rider. No simulated coordinates count as live GPS acceptance.

## Account data and support

Account → Privacy & account provides export and deletion. Export includes only the signed-in account plus device-local favourites, recent products, designs and billing details. Closing requires the current password and typing DELETE. Active payments/orders and staff/company responsibilities block closure. Unpaid drafts are cancelled and reserved inventory released; saved addresses/celebrations are removed, login identity anonymized, all sessions revoked and push disabled. Transaction, loyalty and support records remain as disclosed for accounting/disputes and required retention. Corporate/ERP/website records are separate and require support review.

Order support opens an order-linked request. The backend checks ownership, handles retries idempotently and notifies the account of staff replies. **Request a refund** creates a support case; it does not promise or automatically execute a refund.

## Validation evidence

Detailed local test outputs and browser screenshots are under ignored `artifacts/local-preview/`. They use an isolated database, mocked payments and synthetic GPS. Native device acceptance, SMTP and remote push remain separate release gates. No real charge is initiated by this finishing pass.

- Frontend suite: 195 tests passed; final rider/auth lifecycle checks: 12 passed after the last native cleanup change. TypeScript passed.
- Focused backend suite: 83 passed, covering payments, fulfilment, notifications, privacy, support, rider credentials and deployment gates. One existing Starlette/AnyIO deprecation warning remains.
- Browser journey passed predictive search, checkout, kitchen/dispatch, synthetic rider tracking, inbox/deep links, delivery completion and responsive Shop/Club. Additional privacy/export/support browser checks passed at widths 320, 390 and 430.
- Expo native config introspection confirms iOS background location mode and Android background location permission for version 0.3.3/build 19. This verifies generated configuration, not installed-phone operation.
- Local browser API resource timings: 23 samples, median 200 ms and p95 341 ms. These are development-browser observations, not a before/after comparison or a native-device performance claim.
- Dependency audit still reports 11 findings (3 high, 7 moderate, 1 low), including transitive Expo tooling dependencies. SDK-compatible dependency remediation remains a release follow-up; no forced major-version changes were applied.
