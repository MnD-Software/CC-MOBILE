# Cake City local finishing review — 10 November 2026

The splash artwork described below was subsequently revised to a bolder berry/cyan
direction with a bundled cake visual. Club now also has first-points and persistent
tier celebrations plus a refreshed progress page. See [CLUB_CELEBRATIONS.md](CLUB_CELEBRATIONS.md)
for current behavior and validation boundaries.

## Implemented

- Completed-order thank-you screen, correct delivered/collected wording,
  completion time, shop-again action and existing receipt/support tools.
- Private 1–5 star order feedback, server ownership/completion checks,
  idempotent submission and staff review API. Test feedback is marked.
- Account notification inbox, pagination, unread indicators, order links and
  push preferences. The inbox works independently of phone push delivery.
- Expo device registration bound to the account's refresh session, rotation and
  logout handling, silent re-registration after permission has already been
  granted, explicit permission/settings controls and account-safe tap routing.
- Transactional order/rider notification queue, push worker, tickets, delayed
  receipts, retries, expiry, opt-out enforcement and invalid-token cleanup.
- Premium splash/welcome using the supplied Cake City logo, ivory/blush surfaces,
  champagne hairlines, original brand colours and editorial type. Native launch
  background matches the welcome. Entrance lasts about one second, with a static
  reduced-motion alternative and a 1.6-second maximum fallback. It never waits for
  API data and does not repeat when navigating. Native launch configuration needs
  a new binary. Development artwork preview: `/splash-preview` (redirects to Home
  in release builds).

## Verified locally

- Full backend run: **219 passed**; one upstream Starlette/httpx deprecation warning.
- Final notification-specific run: **8 passed**, covering event atomicity,
  account isolation, token/session rotation and logout, push tickets/receipts,
  invalid-device cleanup, retry backoff, opt-out, pagination and review eligibility.
- Frontend run: **175 passed**, including APP order notification routes,
  wrong-account taps, Android channel/permission order and private session binding.
- TypeScript, changed-file formatting, whitespace checks and resolved Expo splash
  plugin configuration passed. Production configuration preflight passed when
  supplied the HTTPS API URL committed in the EAS profile. A preflight pass does
  not verify that the deployed backend contains this release.
- Real local browser/API walkthrough: test checkout → kitchen → dispatch → rider
  delivery → account inbox → completed-order link → saved five-star review.
  Reference: `APP-TEST-20261110-0A90978129224981`. No remote push or payment was sent.
  Checkout and completed order were checked at 320px, 390px and 1280px without
  horizontal overflow. Evidence: `artifacts/local-preview/notifications-verification.json`.
- Splash artwork passed browser checks at 320×568, 390×844, 430×932 and 1280×900
  with no horizontal/vertical overflow or runtime errors. Small and standard phone
  screenshots were visually inspected. Evidence: `artifacts/local-preview/splash-verification.json`;
  screenshots: `artifacts/local-preview/splash-320.png` and `splash-390.png`.

## iPhone development connection

The reported `192.168.0.70:8081` connection error was checked against the running
Metro server. The exact iOS bundle returned HTTP 200 locally and through the
computer's LAN address; this does not establish reachability from the phone.
Windows has Public-network allow rules for Node. Phone local-network permission,
VPN routing and Wi-Fi client isolation remain possible causes.

The Expo Go launcher now respects the selected connection mode instead of forcing
`--lan`, which conflicted with `--tunnel`. For a fresh QR code that bypasses LAN
reachability, run:

```sh
npm run start:go:tunnel
```

If another preview already uses port 8081, use
`npm run start:go:tunnel -- --port 8083`. Scan the **new** QR code with the iPhone
Camera and open Expo Go; reopening the old recent project retains its LAN URL.
Keep the terminal running. Tunnel addresses are temporary and change when restarted.
The current installed SDK 58 CLI supports Expo's built-in tunnel; it requires an
Expo login (`npx expo login`) with tunnel access. An optional ngrok fallback is
`npm install --global @expo/ngrok@^4.1.0`, followed by
`npm run start:go -- --tunnel ngrok`. No tunnel package is required in the app.
See [Expo CLI documentation](https://docs.expo.dev/more/expo-cli/).

The tunnel status, iOS manifest and full compressed iOS bundle returned HTTP 200
during this review (2,216,302 downloaded bundle bytes in 5.3 seconds). All 177
frontend tests and changed-file formatting passed. Actual iPhone reconnection
still requires opening the new preview on the device.

## Deployment and device acceptance

The implementation was validated locally and prepared for GitHub delivery. This
report does not establish a completed Render deployment or a new installed native
build. Real phone notification delivery remains unverified: matching
FCM/APNs credentials, private push-service token, deployed worker/API and signed
Android/iOS device checks are required. See [NOTIFICATIONS.md](NOTIFICATIONS.md)
for exact setup and acceptance steps.

The broader request for a customer-ready mobile app also requires resolving the
existing password recovery/reset 501 endpoints, account/data deletion, approved
privacy/retention content, native accessibility/offline tests and owner-performed
payment verification. These are release blockers, not completed capabilities.
Optional Odoo remains disabled and independent app workflows remain available.
