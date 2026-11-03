# Expo Go SDK 58 upgrade

CakeCity now targets Expo SDK 58, React Native 0.88 and React 19.3. The iPhone's Expo Go client version **58.0.5** supports **SDK 58.0.0**, so the old SDK 57 project could not open in that client. No additional iPhone SDK installation is needed.

Dependencies follow Expo's SDK 58 bundled-native-module versions. App and package versions are both **0.3.0**; the existing `appVersion` runtime policy prevents this native dependency change from sharing the SDK 57 release runtime. Application identifiers and the linked EAS project are retained.

React Native refs now use the strict instance types. The root floating navigation uses `useRouter()` and route hrefs; its unused React Navigation adapter was removed. The web preview explicitly retains SPA output (`web.output: "single"`). Type checking excludes generated/native build output and Python environments, and applies the existing Windows filesystem preload to both route generation and TypeScript.

All seven existing Windows/Android build patches were ported to their installed SDK 58 package versions. Reanimated and Worklets already include their upstream lint workaround; the project patch retains the separate Windows native-output snapshot workaround. Patch application was checked with `patch-package --error-on-fail`. This does not establish a successful native Android build.

Run `npm ci` for the locked dependencies. For the isolated iPhone payment test, run `npm run preview:purchase`, open `artifacts/purchase-test/iphone-qr.png` on the computer and scan it using the iPhone Camera. Keep both devices on the same network and the runner open. The private pairing code is in `artifacts/purchase-test/TEST-ACCESS.txt`. See [the purchase review guide](PURCHASE_TEST.md) for billing, points and receipt instructions.

Existing installed development/release binaries need a new native build before using this SDK. Generated local Android files from SDK 57 must be regenerated from app config before the next native build; no generated native project was deleted as part of the Expo Go upgrade. This increment does not publish an EAS update or deploy the backend.

References: [SDK 58 release notes](https://expo.dev/changelog/sdk-58), [upgrade instructions](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [Router migration](https://docs.expo.dev/router/migrate/sdk-57-to-58/).

## Validation on 24 October 2026

- 137 frontend tests passed. Final TypeScript, formatting, dependency alignment, production configuration and patch-content checks passed.
- iOS manifest: SDK 58.0.0, app 0.3.0, HTTP 200. iOS bundle: HTTP 200, 12,616,883 bytes, purchase/billing/print modules included.
- Real local browser/API test passed four purchases, membership upgrades, all unsuccessful outcomes, billing validation/save/restore and TEST receipt PDF export.
- Expo Doctor's online schema check could not establish a TLS connection to the Expo API; this check remains unverified.
- Native iPhone runtime and printing/sharing, new native binaries, GitHub delivery and hosted deployment were not completed by these checks.

Evidence is in ignored `artifacts/sdk58-upgrade/ios-verification.json` and `artifacts/purchase-test/browser-verification.json`. The first cold OneDrive bundle took approximately ten minutes; subsequent browser bundles completed in seconds. Both local preview runners remain running for review.
