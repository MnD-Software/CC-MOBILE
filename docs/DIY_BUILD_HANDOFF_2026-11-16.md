# DIY and Android testing build handoff - 16 November 2026

## Delivered code

- DIY search is directly under the DIY/Inspiration tabs, followed by a compact fixed cake preview and progress steps. Two-column products scroll independently; a fixed Back/Next/Confirm/Add footer stays reachable. The customer navigation bar is hidden only while using this focused studio route. Tap the preview strip to open the full photo/3D placement editor.
- The 3D board uses the existing embedded Cake City logo texture at three positions around its rim. It requires no external image service. This is a stylised illustration, not a photorealistic cake model.
- Full celebrations contain 1,000 falling pieces in one burst. Accessibility reduced-motion behaviour remains. Native phone frame rate still needs device validation.
- Active order tracking actions have a subtle moving arrow and status halo, paused when the screen is inactive or reduced motion is enabled.
- Shared form and response boxes have consistent spacing, multiline room, focus/error states and contextual icons.
- Custom Cakes categories are hidden by default, including their products, variations, DIY inventory and checkout quoting. Existing orders are retained. Admin/staff/ecommerce managers can change category visibility in web Products or mobile Tools & insights. Controls are audited and reject stale revisions. Category policies are fetched once per catalogue request.

## Validation

- TypeScript check passed; all 286 frontend tests passed.
- Browser checks on an isolated copied review database passed at 320 x 568, 390 x 844 and 430 x 844: no horizontal overflow, fixed preview, usable product viewport and reachable footer.
- Twelve backend catalogue/DIY/category tests passed. Category tests cover hidden browsing, direct product lookup, checkout rejection, permissions, enabling/disabling and stale-update rejection.
- The expanded 3D editor and embedded board logo were visually checked in the browser.
- No live payments, messages, rider payouts or external campaign writes were executed.

## Release and continuation

- Requested target: EAS preview/internal Android APK, not Play Store submission.
- App 0.3.4 uses the existing EAS project under marcos_noel23. Remote Android version increments are authoritative.
- Preview builds use https://cc-mobile-1.onrender.com. Local zero-payment review settings and private artifacts must not be included in the APK. Live payment configuration is unchanged.
- Backend category controls become available on hosted services after that backend revision deploys. A GitHub push alone does not prove Render deployment.
- The owner's current Expo/backend preview must stay running. Separate validation servers may be stopped after checks.
- Native phone installation, real GPU performance and full live payment flow require physical-device testing. Do not claim these from browser/test results.
- App code commit: `7edd182593efa32228c40e031a5cf1732fc73190`, verified on remote `master` and `finalisation-2026-11-15`.
- EAS build: https://expo.dev/accounts/marcos_noel23/projects/cakecitymobiledev/builds/dde1bf8f-3ec3-4c78-850b-03905fd934f5 . App 0.3.4, Android build 26. EAS reported FINISHED at 2026-11-16 06:16:55 UTC (09:16:55 Nairobi).
- Hosted verification: `/health` returned 200, but `/v1/admin/app-categories` returned 404 and Custom Cakes remained visible. Render needs the new backend revision deployed.
- Expo Simulators availability was checked using the latest CLI and returned `available: false` for the linked account. No paid simulator session was started. Cloud Android testing can use this APK once access is enabled; iOS requires a separate simulator build.

## Verified Android artifact

- Download: https://expo.dev/artifacts/eas/Pndn3X8unNw3gzWflSLYT_oeO_qXcauejgziOL5aHn0.apk
- Package: `ke.co.cakecity.mobile`; version `0.3.4`; Android version code `26`.
- Size: 138,154,751 bytes.
- SHA-256: `794fd2289cbb83a1164184b7986f28f7fba928892fb42fa3f6ed2f4d58d246ba`.
- Android APK Signature Scheme v2 verification passed (one signer); ZIP integrity and embedded Android JS bundle verified.
- Private local copy: `artifacts/local-preview/CakeCity-0.3.4-26.apk` (ignored, not committed).
- Installation and native UI/performance on a physical phone remain unverified.
- Separate validation servers on ports 8097/8911 were stopped; the owner's existing 8010/8084 preview listeners were preserved.
