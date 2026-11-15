# Finalisation handoff — 2026-11-15

Base commit: `53ec327` (one commit after the referenced `4d39a5b`; it fixes the DIY null-attribute crash and switches to a single confetti burst). Working tree at start: clean, apart from the untracked `downloads/*.apk` and `integrations/woocommerce/*`. Those are left untouched.

Owner decisions in this session:
- Confetti stays **one giant burst**, as chosen in today's commit and re-confirmed by the owner. The older "three-wave" wording in the brief is superseded. Pieces should be much larger and glossier.
- The DIY 3D view should become a far richer, interactive simulation of the customer's choices. It remains an original procedural **design illustration**, not a photorealistic product scan.
- Keep the floating Home coupon shortcut, compact pink-header coupons, membership colours, and the accepted Shop and checkout layouts.
- Keep AI and Odoo paused. Keep the review sandbox isolated, and do not touch production payment settings.

## Prioritised audit

Three independent read-only audits ran: auth/session, server roles, and checkout. Each item was then re-checked in code before fixing. Status: **Fixed** / **Open (needs owner)** / **Open**.

### P0: data exposure and permission gaps
1. **Kitchen and dispatch can read full customer PII and the payment link through the service desk.** `service_desk.py` `detail`/`receipt` → `access()` admits any KITCHEN or DISPATCH role at the plant.
2. **The old `PATCH /v1/admin/app-orders/{ref}` skips custom-design approval** (and the kitchen assignment check when no production task exists). `routes_app_admin.py`.
3. **The bag persists across accounts on one device.** `useBag` uses the global AsyncStorage key `cakecity.bag.v3` and is never cleared on sign-out, on sign-in as another account, or on a 401 during refresh.
4. **The `/v1/corporate/.../quotes/{id}/accept` path ignores per-approver limits.** These are enforced only on `/v1/business`. `routes_corporate.py`.
5. **The company orders list returns other members' private order data** (snapshot, payment URL, tracking ID). `business.py` `order_view(o)` defaults to private.
6. **Favourites and recent searches are global**, not owner-scoped. `commerce/store.ts`.
7. **Signing out during an in-flight refresh leaves the newly issued server session alive.** The push device stays bound to it, so pushes continue. `AuthProvider.tsx` `accept()`.

### P1: correctness
8. **An abandoned or pending Pesapal payment holds its coupon and stock indefinitely.** There is no expiry sweep. **Open (needs owner):** this needs an agreed TTL and a background job that cancels live unpaid orders. It was not implemented without approval because it changes live order records.
9. **A reversed payment does not restore the Club points spent on a reward coupon.** **Open (needs owner):** a ledger change on live financial events. Recommended: an idempotent `restore:{reference}` credit.
10. **A `first_order_only` promotion counts only completed orders**, so two concurrent unpaid orders can both use it. `promotions.py`.
11. **Order detail keeps polling after `payment_failed` or `review_required`.** `AppOrdersScreen.tsx`.
12. **An offline cold start with a valid saved token shows sign-in**, and nothing retries the refresh on reconnect.
13. **An expired-session (401) path clears less local data than manual sign-out.**
14. **Retrying a half-finished Club redemption is blocked when the account is flagged for review**, and a concurrent duplicate can 500.
15. Low: `new_trip` does not check the rider's plant scope. The dispatch rider list is unscoped. Earnings fare/approve/pay has no separation of duties. Enquiry read is broad for non-call-centre roles.

### Verified correct (no change)
- **Server-side pricing:** prices, delivery fee, discounts, quote digest, atomic coupon and stock claims, and the idempotent order key are all recomputed on the server.
- **Money and Pesapal:** integer minor units throughout. The IPN is verified through `GetTransactionStatus` and is idempotent.
- **Account isolation already in place:** the query cache is cleared and the session generation is guarded on switch. Coupon wallet, Club appearance and designs are owner-keyed.
- **Rider and dispatch rules:** rider tasks are owner-bound. The capacity override is limited to Dispatch Manager.
- **Review sandbox:** the zero-payment sandbox is guarded by development-only, local SQLite, local host/port, no Pesapal keys, and `__DEV__` on the client.

### Product and UI
- **The DIY 3D view is a 110–150 px flat-shaded sketch.** It reloads the whole WebView on every change (which flashes) and ignores flavour, size and extras.
- **Confetti pieces are 5–10 px** and read as small.

## Work log

Audit status: items 1–7 and 10–15 (except the low items listed under Remaining) are **Fixed**. Items 8–9 are **Open (needs owner)**.

### Server permissions (`backend/`)
- **Item 1.** `service_desk.py` adds `operational_only()`. For kitchen and dispatch roles, `detail` omits customer contacts, checkout contacts, snapshot, payment URL, tracking ID, totals and invoice. Kitchen also loses the recipient; dispatch keeps the recipient name and phone for delivery. `receipt` returns 403 for those roles.
- **Item 2.** `routes_app_admin.py`: moving an order to `preparing` now requires the current custom design to be approved (`journey.require_design_approval`), and production requires an assigned `ProductionTask`. The full-purchase-cycle test now assigns that task first.
- **Item 3.** New `business.require_approval_limit()`. It is used by both the business transition and `/v1/corporate/.../quotes/{id}/accept`. Owners stay unlimited, and a null limit still means unlimited.
- **Item 4.** The company orders list hides other members' private order data.
- **Item 10.** `first_order_only` counts reserved or paid, non-cancelled orders.
- **Item 14.** The Club redeem retry can finish issuing the coupon even when the account is flagged for review. A concurrent duplicate insert is caught and re-read.
- **Rider plant scope.** `new_trip` checks the rider's plant through `rider_serves_plant`; a rider with no grant counts as HQ only. This applies only to dispatcher assignment; Odoo import is unchanged.
- **Tests:** a regression test for each item in `test_logistics.py`, `test_corporate.py`, `test_ux_operations.py` and `test_journey.py`.

### Client account isolation
- **Items 3 and 6.** `commerce/store.ts`: the bag records its owner and is cleared when a different account signs in, on sign-out, and on 401. A bag saved without an owner by an older build is dropped. Favourites and recent searches are kept per account (persist version 2; the migration drops the old global lists). Updated consumers: favourites, Shop, Cart, Account, and privacy export and closure.
- **Item 7.** `AuthProvider.tsx` revokes refresh tokens that a sign-out or account switch discarded. This covers both refresh and sign-in races.
- **Item 13.** New `src/auth/local-session.ts` provides `wipeLocalSession()`, shared by logout and the 401/403 path.
- **Item 12.** New `src/auth/restore-policy.ts`. A network, timeout, 5xx or 429 failure during cold start keeps the loading/offline state and retries on reconnect, on foreground, and with a 5–60 s backoff. A 401/403 still signs out.
- **Item 11.** Order detail stops polling on `payment_failed` and `review_required`.
- Deleted the unused `src/store/cart-store.ts`.
- **Tests:** new `tests/account-isolation.test.cjs`, plus five new cases in `tests/auth-session.test.cjs`.

### DIY 3D design illustration
- **Renderer** (`studio/cake-scene.ts`): rewritten as offline WebGL 1 with no network, models or textures. It is an original procedural *design illustration*, not a scan.
  - **Cake geometry:**
    - Lathed icing with a hand-finished wobble and scraper lines.
    - Piped star rosettes and a bead border.
    - A gold foil board and a contact shadow.
    - Ganache or caramel drips that pour down when added.
  - **Flavour and size:**
    - Flavour looks come from the product name: sponge and filling colours, plus strawberries, cherries or mixed berries.
    - The size scales with the inventory weight (0.5–6 kg).
  - **Message, candles and sprinkles:**
    - The message is piped in cursive and writes on as the customer types.
    - Striped candles drop in with flickering flames.
    - Sprinkles fall in when the extra is added.
  - **Inside view:** "Inside" (slice) lifts out a wedge and turns the camera to show the layers.
  - **Interaction:**
    - Drag with inertia, pinch to zoom, tap for a bounce and sparkles, double-tap to reset.
    - The cake turns slowly when idle.
    - Icing colour changes blend smoothly.
  - **Accessibility and performance:**
    - Reduced motion turns off auto-rotation, bounces, sparkles and flicker.
    - The loop pauses when the page is hidden.
    - It falls back to a text note if WebGL is unavailable.
- **Live updates** (`ModelScene(.native).tsx`): the HTML loads once per cake. Changes are pushed in by `injectJavaScript` on native and `postMessage` in the web iframe, so there is no reload flash. Customer text is JSON-escaped (`<`, U+2028, U+2029), and colours and backdrop are restricted to `#RRGGBB`.
- **Stage** (`CakeStage.tsx`):
  - 3D is now the default tab, with Photo still available.
  - Glass "Show inside layers" and "Enlarge" switches, with haptics.
  - Height is 128 px on phones under 640 px tall, 150 px under 700 px, 200 px otherwise, and up to 420 px enlarged.
  - The studio passes the size (`cakeWeightKg`) and the sprinkles extra.
- **Copy:** the stage still reads "3D design illustration" and "Illustrative layers". No realism claim was added.

### Celebration and visual polish
- **Confetti:** still one giant burst (owner's choice), now 320 large foil pieces (96 in compact mode). The shapes are ribbons, squares, coins and streamers, about 13–24 × 30–84 px. Each piece flips in 3D (rotateX/Y) with a travelling glint and a lower shade, firing from two cannons plus a top shower. Everything runs on one native-driver clock, with no per-piece shadows for performance. Reduced motion still skips it.
- **Buttons:** new `GlossSheen` adds a liquid-glass specular layer (upper lens, horizon, bounce light and an inner highlight) to primary, secondary and danger buttons. Outline and ghost buttons are unchanged, and colours, sizes and hit areas are untouched.
- **Coupons:** the pink-header direction is kept. New `CouponPerforation` adds ticket notches and a dashed seam. The checkout coupon header and `PromotionPreview` header are glossy, and a selected checkout coupon gets a pink glow.
- **Floating Home shortcut:** same position and colours, now with gloss, an offer-count badge (1–9+), and a calm pulse ring (two soft beats, then a rest). The pulse stops when the screen is inactive or reduced motion is on.
- **Layout fixes found during browser checks:**
  - The DIY "New sketch" header button stretched to the full header height. Its shared `Button` default `alignSelf: stretch` is now overridden there.
  - Screen titles broke mid-word at 320 px ("playgroun|d"). `Screen` now uses a 21 px title below 360 px width.

## Evidence

### Automated and local
- **Frontend:** `npm test` passes **273/273**. `npm run typecheck` passes.
- **Backend:** the full suite (repo `.venv`, 23 min) had **363 passed, 2 failed**.
  - `test_journey.py::test_trip_qr_…` fails because the local venv lacks `qrcode` (pinned in `requirements.txt` as `qrcode==8.2`). Run `pip install -r backend/requirements.txt`.
  - `test_order_history_filters.py::test_active_and_past_tabs_…` also fails on a clean worktree of `53ec327`, so it predates this work. Summaries now include `image: None`, which the test does not expect. Not changed.
- **3D renderer:** checked in headless Chrome with SwiftShader WebGL for five configurations (vanilla, chocolate 2 kg with drip, candles and message, strawberry with sprinkles, red velvet slice, black forest slice). Screenshots were reviewed; they are in the scratchpad only, not the repo.
- **Browser flow:** `artifacts/local-preview/final-browser.cjs` (ignored) ran against an isolated copy (`final-validation.db`, API `127.0.0.1:8911` with provider keys blanked, Metro web `:8097`). The owner's review API (`:8010`) and its data were not touched, and both validation processes were stopped afterwards.
  - Signed in, then saw the floating rewards shortcut with its badge and opened the rewards sheet.
  - DIY mounts 3D by default. Chose Red Velvet, turned slice on, and enlarged the stage.
  - No horizontal overflow at 320×568, 390×844 or 430×932.
  - 0 runtime exceptions in the final run. An earlier cold-Metro run logged an "ionicons font timed out" dev-server warning.
  - Screenshots: `artifacts/local-preview/final-*.png`.

### Not verified
- **Physical device (Android/iOS):**
  - WebView WebGL performance and gestures (pinch, inertia), and the injected live updates.
  - Native confetti frame rate with 320 large pieces on low-end Android.
  - The iOS Liquid Glass and Android blur look of the new glass controls.
  - The pulse and haptics.
- **Hosted Render deployment:** not verified.
- **Push and email delivery:** not exercised.

## Remaining / owner decisions
- **Item 8:** an expiry sweep for abandoned or pending payments that still hold a coupon and stock. Needs an agreed TTL (suggested 30–60 min) and approval to auto-cancel live unpaid orders after `GetTransactionStatus` confirms they are unpaid.
- **Item 9:** restore Club points when a paid reward-coupon order is reversed. Needs approval for an idempotent ledger credit (`restore:{reference}`).
- **Low, still open:**
  - The dispatch rider list is unscoped.
  - Rider earnings have no separation of duties (one dispatcher can set, approve and pay).
  - Enquiry read access is broad for non-call-centre roles.
- **Realism:** exact flavour realism still needs artist or photogrammetry models. The procedural cake is illustrative.

## Restart / build
- **No new dependencies; JS only.** All changes ship in the JS bundle; `react-native-webview` and `expo-linear-gradient` were already installed. A running Expo/Metro picks them up on reload. Use `npm run start:go:tunnel` as before; no cache clear is needed.
- **Backend:** restart the API to load the permission fixes. Render's `python -m app.start` runs migrations, but none are added here. Install `requirements.txt` locally (`qrcode`).
- **Data and behaviour:**
  - The persisted store version goes from 1 to 2: old global favourites and recent searches, and ownerless bags, are discarded once on upgrade. This is intentional.
  - The DIY tab now opens in 3D, and Photo is one tap away.
- **Not done:** nothing committed. AI and Odoo stay paused. No payment settings changed, and no live records were altered.
