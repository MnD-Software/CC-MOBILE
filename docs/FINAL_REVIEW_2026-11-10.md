# Cake City final local review — 10 November 2026

Later increment: see [LOGISTICS_DELIVERY_2026-11-10.md](LOGISTICS_DELIVERY_2026-11-10.md)
for the new independent kitchen/rider/dispatch workflows and optional Odoo addon.
The counts below describe the earlier review; the delivery record has current results.

Status: ready for local owner review. Production sign-off remains open.
Scope selected by the owner: finish fixes and review locally first.

## Changes completed

- Fixed the formatting failure in `tests/independent-app.test.cjs` that blocked CI.
- Updated `backend/verify_deployment.py` to check the independent app's route
  methods for authentication, catalogue, orders, payment callbacks/verification,
  receipts, delivery, Club and staff fulfilment. It checks database readiness and
  reports missing checkout configuration. `--require-checkout` makes those
  configuration gaps fail the command. All network requests are public GETs.
- Isolated the local preview from inherited Pesapal merchant profiles/callbacks,
  Maps keys, sales-ingestion secrets and website credentials. Factory guards reject
  these settings before opening the preview database. Local catalogue/media URLs
  use `http://127.0.0.1:8010`, so imported images load from the review database.
- Added regression coverage for stale deployment detection, database readiness,
  missing checkout configuration, unsafe URLs and inherited preview integrations.
- Extended the existing browser checker with `--commerce` to capture Home, Shop
  and actual imported product details at 390px and 1280px, checking overflow.
- Corrected the dashboard role documentation for production, dispatch, branch
  managers and customer service.

The existing SDK 58 upgrade and accepted app design were preserved. The required
[Expo v57 reference](https://docs.expo.dev/versions/v57.0.0/) was read before code
changes. No SDK downgrade or dependency upgrade was performed.

## Verified results

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend tests | 174 passed, zero failures/skips | `artifacts/final-review-2026-11-10/frontend-tests.log` |
| TypeScript | Passed | `artifacts/typecheck-final-2026-11-10.log` |
| Formatting | Passed after fixing the failing file | `npm run format:check` |
| Backend full suite | 180 passed | `artifacts/final-review-2026-11-10/backend-tests.log` |
| Final preview/checker regression run | 19 passed after the local media-origin correction | `artifacts/final-review-2026-11-10/review-checks.log` |
| Production build configuration | Passed with the API URL from `eas.json` | `EXPO_PUBLIC_API_URL=https://cc-mobile-1.onrender.com npm run release:check` |
| Expo web export | Passed | `artifacts/final-review-2026-11-10/web-export.log` |
| Real local browser/API review | Passed customer/admin sign-in, corporate workspace, Command Center, and six commerce screen/width checks; no runtime exceptions or external writes | `artifacts/local-preview/browser-verification.json` |
| Screenshot inspection | Home/product at phone width and Shop at desktop width inspected; all six captures had no horizontal overflow | `artifacts/local-preview/home-390.png`, `product-390.png`, `shop-1280.png` and the other screen captures |

The Python suite emits one upstream Starlette TestClient deprecation warning about
its httpx adapter. Tests pass; dependency migration was not part of this review.

## Public backend observations

Read-only responses collected on 10 November 2026 confirm:

- `/health` reports `independent-app-commerce-v1` and no website dependency.
- `/ready/db` reports a ready database.
- All route/method requirements in the updated checker are present in the saved
  deployed OpenAPI document. The catalogue returns products.
- Pesapal reports app-owned checkout, live environment and available settings.
  This is configuration evidence only, not merchant activation or payment proof.
- Pickup is enabled with HQ collection instructions. Distance delivery is disabled;
  its origin coordinates and radius are unset. Maps settings are present.
- Published pages do **not** include `privacy-policy`.

Evidence: `artifacts/final-review-2026-11-10/deployment-review.json` and adjacent
`deployed-*.json` responses. The checker was evaluated against those saved public
responses. No authenticated production request, payment attempt, IPN registration,
staff mutation or production data import was performed.

## Review locally

The review server is running at:

- Customer app: <http://localhost:8082>
- Staff dashboard: <http://127.0.0.1:8010/admin>
- Local sign-in details: `artifacts/local-preview/LOGIN.txt` (ignored by Git).

If the processes stop, run `npm run preview:local`. If Python is not discovered,
set `CAKECITY_PREVIEW_PYTHON` to the executable for an environment with
`backend/requirements.txt` installed. Credentials and the review database remain
local. This review imported the existing `artifacts/independent-app-export`
catalogue into `artifacts/local-preview/review.db`; it did not change production.

Review Home/search, categories, product variations, the bag, account/Club and staff
screens. Ordinary local checkout has no approved tax/pickup policy and payment is
unavailable by design. Staff can use the explicitly labelled KES 1 simulation to
review order/Club/fulfilment behavior without a merchant; it is not a real payment.
The automated full-cycle test covers duplicate confirmation, Club credit, kitchen
and dispatch permissions, customer tracking and exclusion from live sales.

To repeat the browser review after starting the preview:

```sh
node scripts/verify-local-preview.cjs --commerce
```

## Remaining release gates

1. Publish Cake City's approved independent-app privacy policy through the staff
   app-pages API. The checker flags its absence; policy content was not invented.
2. Review imported policy text, product prices, missing source images and actual
   pickup/tax terms. Historical migration limitations remain documented in
   `PESAPAL.md`; this review does not certify complete catalogue media.
3. Confirm whether launch is pickup-only. If distance delivery is required,
   configure the actual HQ point, radius and branch coordinates, then exercise
   real route quotes before enabling it.
4. Install the current native build on Android and iPhone and verify sign-in,
   navigation, variation selection, embedded payment/bank authorization, app
   restart/order recovery, saved receipt and accessibility.
5. The owner performs the live payment and confirms the same order, provider
   status, amount/currency, Club entry and staff workflow. Merchant activation,
   settlement and authenticated production behavior remain unverified.
6. Validate deployment/backup restoration and store release requirements before
   public launch. A passing web export or test suite does not certify these.

All changes from this review are local and uncommitted. No app build was published,
no store submission was made, and no backend deployment was triggered. Existing
untracked APK and retired WooCommerce integration files were left untouched.
