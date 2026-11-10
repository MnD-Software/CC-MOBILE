# Delivery completion, reviews and notifications

## What is implemented

Completed, paid delivery orders show a Cake City thank-you card with the completion
time, a shop-again action, receipt/support tools and private 1–5 star feedback.
Pickup orders say collected. Simulations say test journey complete. A review is
stored once per order, requires ownership and completed fulfilment, and accepts
identical retries without duplication. Test/sandbox feedback is labelled and is
not published as a real product review. Staff can read `/v1/admin/order-reviews`.

Account → Notifications opens a persisted, paginated inbox with unread markers,
timestamps and links to orders. Events cover verified payment, preparation,
readiness, out for delivery, completed fulfilment, cancellation and reversal.
Rider assignment/reschedule/cancellation events link to the rider workspace.
The inbox works on web and native. Phone alerts use Expo Push, APNs and FCM in an
installed app. Marketing is off; no marketing sender is implemented.

Order events and inbox/jobs commit in the same database transaction. Repeated
events do not duplicate alerts. Devices bind to the signed-in account and its
refresh session; rotation preserves this binding and logout revokes it. Token
reassignment cancels older queued jobs through a generation check. Disabling order
push also suppresses already queued alerts; the inbox remains available.
No address, phone number, payment credentials or delivery proof is placed in push
content. An already transmitted alert cannot be recalled after logout. Foreground
display and tap routing reject payloads for another signed-in customer.

## Activate phone push

1. Deploy this backend and run `python -m app.migrate` against its existing database.
2. Use the committed EAS project `dad0f312-d1c4-4636-bf66-9f813e436509` and app identity
   `ke.co.cakecity.mobile`. Confirm project access before configuring credentials.
3. Configure FCM v1 credentials for Android and APNs credentials for iOS with
   `eas credentials`. For Android, supply the matching Firebase `google-services.json`
   through the private `GOOGLE_SERVICES_JSON` EAS file environment variable. The
   dynamic Expo config reads its path; do not commit service-account keys.
4. Enable enhanced push security in the Expo project and put its access token only
   in private backend/worker environment settings as `EXPO_PUSH_ACCESS_TOKEN`.
5. Set `PUSH_ENABLED=true` on both API and worker, and give both the same persistent
   `DATABASE_URL` and production settings. Start a continuously running worker:

   ```sh
   python -m app.notification_worker --loop
   ```

6. Build/install the new Android/iOS app with its HTTPS backend URL. Open Account →
   Notifications → Enable phone notifications. The OS prompt appears only following
   this action. Previously granted permission re-registers on sign-in/foreground.
   Denied permission has an Open device notification settings action.
7. Verify one authorized order on a real device: background, foreground and closed
   app; tap an alert; confirm the correct account/order, then test logout and a
   different account. Verify preparation, departure and delivery separately.

The worker supports atomic leases, bounded retries/backoff, 24-hour job expiry,
Expo ticket storage, receipt checks after 15 minutes and DeviceNotRegistered token
cleanup. `/v1/admin/notifications/status` returns configuration/device/job counts
without exposing tokens. Monitor failed jobs and worker process uptime. A
`provider_ok` receipt means the push service handed the message to APNs/FCM; it
does not prove the customer read or even saw it. The OS may delay or suppress it.
Send-time network ambiguity can produce a duplicate; payload notification IDs and
collapse IDs support deduplication. The persistent inbox is authoritative.

Simulation and sandbox orders create inbox entries but never remote push jobs.
The isolated preview forcibly disables push and clears its access token. Provider
tests use mocks; no remote alerts or real payments are sent during local QA.

## Local walkthrough

Run `npm run preview:local`, use the ignored `artifacts/local-preview/LOGIN.txt`
staff accounts, and follow the test cake flow in [PESAPAL.md](PESAPAL.md).
After rider delivery, sign back into the ordering account, open Notifications and
follow the completed-order entry. Submit a rating and reopen the order to see it
persisted. The automated equivalent is:

```sh
node scripts/verify-local-preview.cjs --checkout --logistics --notifications
```

## Release acceptance still required

Source/tests and local web QA do not establish App Store/Play readiness. Before
calling the app ready for customers, complete these checks:

| Area | Required evidence |
| --- | --- |
| Native push | Matching FCM/APNs credentials, signed builds and real-device background/closed-app delivery/tap tests |
| Payments | Owner-performed sandbox/live verification, correct provider callbacks, reconciliation and refund handling |
| Account recovery | Password recovery/reset routes currently return 501; configure and implement email delivery before launch |
| Account deletion | Provide in-app deletion and the required public deletion-request flow, with an approved retention policy |
| Legal | Owner-approved privacy/terms/support content and accurate store data-safety/privacy declarations |
| Operations | Approved logistics rules, monitored worker/API/database, backups and a tested restore |
| Devices/accessibility | Signed Android/iPhone checks, small/large screens, screen reader, font scaling, denied permissions, offline/resume and session renewal |
| Deployment | Explicit HTTPS backend URL, migrations, notification worker, current API verification and rollback procedure |

The app remains independent; optional Odoo integration stays disabled. See
[ODOO19_SETUP.md](ODOO19_SETUP.md) for its separate integration acceptance checks.

Primary references: [Expo notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/),
[push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), and
[sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
Account deletion references: [Apple](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
and [Google Play](https://support.google.com/googleplay/android-developer/answer/13327111).
