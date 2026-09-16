# Cake City reference UI

[Review the actual screens beside the supplied design](reference-ui-review.html).

Home, Cakes and Product Details use the owner's exact cake names, starting prices, logo, category artwork and photographs. The supplied promotional banner is an accessible product link. `ReferenceArtwork.tsx` clips regions of the unchanged source image; the final app does not use the generated cake experiment. Raster artwork sharpness is limited by the supplied image resolution.

Search, filters, sorting, favourites, product navigation, size/flavor selection, messages and quantity controls work. Reference favourites persist on the device. The five tabs and native safe areas remain supported.

## Ordering

The five named reference cakes are display records with negative IDs and no asserted inventory or purchasability. A live product with the exact matching slug, confirmed stock and a current backend quote accepting the chosen configuration is required before adding to the real bag. During validation, Chocolate Fudge Delight had no matching public catalogue listing; the cart guard explained this and left the bag empty.

Cart counts, reviews and delivery availability use actual state. The reference's sample cart count, review count and delivery countdown are not fabricated. Partially visible unnamed products and extra photograph angles are not invented. Other departments retain live WooCommerce browsing.

## Validation

- Expo SDK 57 versioned documentation reviewed before implementation.
- TypeScript, formatting and all 20 tests passed.
- Browser checks passed for favourites, search/filters, size/quantity selection and the unavailable-product cart guard.
- No unhandled browser exceptions or horizontal overflow at the checked 360, 390 and 430 pixel widths. Captures and results are in `docs/reference-ui`.
- Production web export checked from `C:\CakeCityUiReview-20260914`, with source/asset hashes matched to this workspace. OneDrive file scanning required this clean staging directory.

The captures in `docs/reference-ui` are browser renders of the actual Expo app.

On September 16, 2026, the standalone Android build was installed over the existing app and cold-started on a Samsung Galaxy S21 (SM-G991N). All 10 screen checkpoints passed: Home, Cakes, Product Details, Cake Studio, Orders, Account, Register, Cart, Checkout and the return to Home. Tapping the Home banner opened Product Details, and Android Back returned to Home. No fatal Android or React Native JavaScript errors were detected for the running app process. The app was left on Home.

Device screenshots, UI hierarchy captures and the verification result are saved locally in `artifacts/android-qa`. The APK is `dist/CakeCity-0.2.0-preview.apk` (50,082,442 bytes; SHA-256 `55da637741a6ba0a0450956ba5692e42fd5bdaf1fefdee5b207e8f3cb3761c63`). Signature, package identity (`ke.co.cakecity.mobile`), version 0.2.0 / code 2, arm64 ABI and the embedded JavaScript bundle were checked. The reference image embedded in the APK has pixel-identical artwork to the supplied source image.

This APK uses an internal testing certificate and has no configured account/checkout backend. Authentication, live checkout and payment completion remain unverified. Native navigation checks do not establish those services' readiness.

```sh
npm run typecheck
npm run format:check
npm test
npm start -- --port 8081
npm run verify:ui
npm run export:web
node scripts/verify-android.cjs dist/CakeCity-0.2.0-preview.apk <authorized-device-serial>
```

`verify:ui` uses an isolated Chrome profile. Override `CAKECITY_QA_BROWSER` or `CAKECITY_QA_URL` if necessary. It relays unchanged public catalogue responses to avoid localhost CORS restrictions; private commerce APIs are never mocked. A reachable backend is required for authentication and ordering.

The Windows development helpers correct OneDrive directory entries falsely marked as symbolic links and regenerate Expo Router declarations before typechecking. Actual symbolic links keep their original behavior.
