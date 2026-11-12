# Shopping and fulfilment finishing pass — 12 November 2026

## Shipped behavior

- Cold-launch brand artwork remains visible for about 5.5 seconds. Reduced-motion users get the same reading time without the fade/zoom. A six-second fallback prevents the overlay waiting indefinitely on accessibility settings. Web navigation has no forced splash delay.
- Product, category, cart, checkout, order, reward, gallery and profile images use the shared lazy loader. It shows a skeleton while loading and retries transient failures automatically with bounded backoff. Returning to the app or regaining connectivity restarts failed images. A permanent failure stops the shimmer and uses a quiet image placeholder; no customer retry button is shown. Image URLs retained from an old preview tunnel resolve through the current API.
- The Club selection uses the actual moving navbar highlight rather than a second inset pill. The Club badge/glow remains, and icons share a common slot so labels align.
- Checkout keeps one primary review/pay action. Location and order actions use compact horizontal groups, with wrapping on narrow screens. Duplicate Edit bag actions are removed. The simulated purchase's tracking and Club actions sit side by side.
- Coupons are discovered privately for the signed-in customer, including issued Club rewards and public codes already saved in their wallet. A visible checkbox lets the customer apply/remove a suggested reward. Below-minimum coupons show the required extra spend. No points are redeemed automatically; the authoritative quote verifies eligibility and savings before payment. One coupon per order remains enforced.
- Orders has Active and Past orders tabs. Date range (inclusive Kenyan calendar dates) and cake/product-name filtering happen on the server before pagination, so matches are not limited to the first loaded page. Cards show purchased names, quantities, sizes, date and total. Completed/closed purchases say View order; their old tracking timeline is collapsed in order details.
- Home uses an updating milestone card and a slow marquee: confirmed → kitchen → ready → dispatch → delivered/collected. It polls only while visible. Reduced-motion users see a static stage label. The customer can switch among pending home updates. Delivered orders remain until their owner taps Received, thank you. This idempotent acknowledgement dismisses the home card across devices, preserves order/receipt history and cannot mark an unfinished delivery complete.

- Home's compact order update stays pinned below the browse header while scrolling. Progress lines stay stationary while the milestone text moves underneath. Completed milestone labels and lines turn green; labels also show a checkmark. The current step stays white, future steps stay muted, and the final delivered/collected state makes every step green. Reduced-motion users retain the static label. Validation for this follow-up: TypeScript passed using the direct compiler, and all 11 targeted order tests passed. Phone visual acceptance remains pending.

- The pinned order header now paints an opaque background across both page gutters, hiding scrolling content around the card's rounded edges. The marquee sits in a full-width footer band with matching gradient fades at both ends instead of abruptly clipped text. Green completed steps and the fixed progress lines are preserved. This follow-up passed the 11 targeted order tests; native scrolling appearance still needs device acceptance.

- Orders now uses green completion indicators too: recorded completed milestones have green labels, checkmarks and progress segments; the current recorded milestone remains distinct and future steps remain muted. Completed purchases in Past orders show a green status/checkmark, and their tracking hero uses the delivery-complete green palette. Cancelled, failed and reversed purchases do not receive the completed-order treatment. Only recorded milestones are colored; missing events are not invented.

## Image source limitation

The local archive held 368 valid image copies; all decoded successfully with an AVIF-capable decoder. The audit found 84 additional unique image sources referenced by the app. Explicit operator repair recovered one, leaving **83 unavailable sources**. Their public sources returned errors; retry UI cannot reconstruct a missing image. No unrelated cake photo was substituted. The remaining URLs are listed in `MISSING_IMAGE_SOURCES_2026-11-12.md` for asset replacement.

The repair tool is an explicit operator action, never a request-time proxy or automatic production update:

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.repair_media --report image-repair-report.json
```

It writes only missing image copies to the configured app database. It preserves products, pricing, stock, orders and payments. Select the intended database privately before running it; production repair/replacement is not implied by the local repair.

## Release and verification

Deploy the backend before shipping the mobile UI. `python -m app.start` runs the additive migration for `order_acknowledgements`. New authenticated routes include `/v1/account/home-orders`, `/v1/app-orders/{reference}/received`, and `/v1/account/coupons/available`. Existing order-list clients retain the unfiltered contract; new clients pass scope/date/cake filters.

Local unit/API checks cover automatic image recovery, safe image origins, coupon ownership/minimum spend/selection, filtered pagination, receipt acknowledgement and payment recovery. Phone rendering and cold-launch timing still need device acceptance. A separate browser preview could not be started because automatic approval review returned “blocked by policy”; browser visual acceptance for this pass is incomplete.

Results: 206 frontend tests passed; 48 focused backend tests passed; TypeScript passed. The backend suite reported one existing Starlette/AnyIO deprecation warning. No live payment was submitted. The temporary verification API was stopped; the customer's existing Expo Go session was left running.

Restart `npm run start:go:tunnel` and reopen its current Expo Go session after this update so the local backend loads the new routes. Refresh alone does not reload Python route definitions.
