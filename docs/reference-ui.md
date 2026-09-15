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

These captures are browser renders of the actual Expo app. Native installation and payment completion are unverified; no new APK is claimed.

```sh
npm run typecheck
npm run format:check
npm test
npm start -- --port 8081
npm run verify:ui
npm run export:web
```

`verify:ui` uses an isolated Chrome profile. Override `CAKECITY_QA_BROWSER` or `CAKECITY_QA_URL` if necessary. It relays unchanged public catalogue responses to avoid localhost CORS restrictions; private commerce APIs are never mocked. A reachable backend is required for authentication and ordering.

The Windows development helpers correct OneDrive directory entries falsely marked as symbolic links and regenerate Expo Router declarations before typechecking. Actual symbolic links keep their original behavior.
