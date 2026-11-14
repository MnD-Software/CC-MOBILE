# Cake City mobile completeness and review upgrade

## Latest owner correction

Restore Pink Simba to the shared Home carousel card and change only image fitting. Exclude cupcakes from All cakes, keeping their own department. Replace numbered purchase tiles with compact milestone progress, refine profile hierarchy, smooth shared popup entrance/exit and replace web console text branding with the existing Cake City logo. Preserve current product data, saved profile/Club details and local review boundaries. Validate and push this follow-up; device visual acceptance remains separate.

Additional request: completed dispatch cards should be green, with per-ride rating and colour-coded arrival/condition notes. Store customer feedback per delivery task in the existing order event history (no schema migration), requiring owner-confirmed receipt. Keep it separate from the overall cake rating; missing feedback is explicitly pending. Arrival time is customer-reported because the current trip schedule is not a guaranteed customer arrival deadline. Only show green timing/condition notes when reported as on time/good; show amber/red for late/damage. Dispatch/rider permissions and privacy stay unchanged. Dashboard date/time labels should read naturally without Kenyan/EAT qualifiers, retaining existing business timezone calculations.

Implemented: Pink Simba uses the same `DealSlide` layout as other carousel items, with `contain` fitting for its portrait image. Removed its separate package layout from the carousel. Cupcakes are excluded before server pagination in All cakes and through cached client classification, retaining the Cupcakes department. Club progress is one compact segmented milestone card rather than Purchase 1/2/3 tiles. Profile has a calmer plum hero, larger avatar and focused edit sheet. Shared sheets animate opacity and a short eased translation, retain content during exit, suppress nested dimming and respect reduced motion. Existing logo is served from the dashboard asset allowlist and used on login, sidebar and header.

Completed dispatch uses an emerald gradient with subtle sheen, green completion badge and customer-reported quality chips, on mobile and web. Per-delivery customer feedback records rating 1–5, on-time/late/not-sure, good/damaged/other condition and optional private comment, after receipt confirmation. The unique event key includes the trip ID so multiple deliveries on one order can each be rated. Retries are idempotent; changed duplicate reviews, foreign orders/trips, premature reviews and invalid values are rejected. The overall cake rating remains separate. Completed trips remain visible in the web console without exposing further dispatch actions; the active-trip count excludes completed trips. Dashboard labels are From/To/Date/Updated, with business timezone retained internally.

Verification for this follow-up: 226 frontend tests passed; TypeScript passed; first API selection (logistics, review checkout, dashboard and delivery feedback) 31 passed; final delivery-feedback/notifications/receipt/staff selection 35 passed, including two separately rated deliveries on one order. Updated three-logo shell/asset check passed. Dashboard JavaScript syntax and whitespace checks passed. iOS Hermes export succeeded to ignored `artifacts/local-preview/followup-ios`, `entry-1b75a10f98f15736f239a1d75e8be63c.hbc` (6.6 MB). Tests/logs are local evidence; device visual acceptance, remote notifications and Render deployment remain unverified.

Started 13 November 2026, Africa/Nairobi. Continue from the current git diff and this checklist if execution is interrupted. The owner explicitly requested this follow-up after the department ecosystem.

## Accepted scope and implementation decisions

- Every mobile staff module must open a native module, never redirect to the web console. Web remains a separate authenticated interface using the same APIs. Reuse working native editing screens where possible and build missing catalogue, promotion, payment, Club, order, delivery and staff management tools.
- For the isolated local review, any enabled product can be ordered without collecting money. Preserve actual product prices and order totals, with zero due for collection during review. Customer-facing copy follows the ordinary order journey without simulation banners. Internally record review orders distinctly, never count them as real revenue, never call a payment provider and never expose a production payment bypass. Production checkout remains unchanged until explicitly configured later.
- In local review only, advance a Club milestone after each three completed review purchases. Keep production loyalty rules intact. Trigger the ordinary card/message/confetti lifecycle once per qualifying purchase and respect reduced motion.
- Upgrade confetti, Club layout, Build a happy moment, order filters, common old disclosure/filter patterns, customer profile image rendering and the Home account avatar. Keep accepted Shop category/sidebar direction.
- Default catalogue starts with cakes in ascending price order. Separate Accessories with party items/candles/etc. Consolidate Offers into Deals & Steals without deleting underlying products or history. Home search needs a cancel action.
- Improve mobile/web operational presentation. Dispatch can provision rider-only accounts within its authorized scope; riders see/accept only their assigned tasks, cake details, recipients, destination and delivery instructions. Preserve audited assignments, readiness and proof checks.
- Provision the owner's requested dispatch login in the isolated local review only, hashing its password. Never commit credentials or apply weak/shared credentials to production. Private access details stay in ignored review artifacts.
- Odoo and AI remain paused. No real payment, email or remote push test is authorized. Provider configuration and actual device/browser acceptance remain distinct from passing code tests.

## Working map

Staff native: `src/features/staff/`, `app/workspace.tsx`; backend overview `backend/app/staff_workspace.py`. Existing web console: `backend/app/dashboard/`. Review isolation: `backend/app/local_preview.py`, `scripts/local-preview.cjs`, `scripts/start-go-review.cjs`. Payment/reconciliation: `backend/app/app_commerce.py`, `routes_pesapal.py`, `payment_test.py`. Customer UI: `src/features/commerce/` and `src/features/account/`.

## Checklist

- [x] Document approach before implementation and read exact Expo 57 docs.
- [x] Audit and implement native staff module completeness.
- [x] Add scoped rider provisioning and complete rider assignment details.
- [x] Add isolated all-product no-charge review checkout and accelerated loyalty.
- [x] Upgrade customer Club/confetti/filters/search/profile/moment presentation.
- [x] Implement cake-first price sorting, Accessories category, and offer naming consolidation.
- [x] Improve web dashboard presentation without disconnecting it from actual APIs.
- [x] Verify permission/payment boundaries and regressions; update exact checks and remaining limits.
- [x] Push intended files and verify GitHub state. Do not claim Render deployed without evidence.

## Current progress

Implemented native catalogue editing/image upload/category chips, promotions, order/payment details with tracking, member balances, exceptions, delivery/HQ/pickup stores and checkout-policy editors, rider provisioning, campaign reading, team/audit records and the existing enquiry/quotation flow. Writable Campaign Studio, kitchen, dispatch and rider workspaces retain their native routes. Staff web-console fallbacks are removed; API permissions remain authoritative.

Web adds rider provisioning, segmented data-view controls, authorized queue counts, status cards, clearer KPI hierarchy and responsive styling. Review mode never fabricates live sales. Customer UI adds filter/tool sheets, search cancellation, persistent profile image data rendered in the shared Home avatar, an animated celebration-builder hero, a Club tier map and three-purchase progress, and 136 staggered confetti particles. Reduced-motion behavior remains supported.

`review_checkout.py` is mounted exclusively by `local_preview.create_app`. Production `app.main` has no review checkout route. Every review request checks development settings, the exact isolated SQLite path and media origin, with live integrations disabled. Current catalogue quotes/totals, stock, coupon validation, ownership and idempotency stay authoritative. Internally these are `app_test` / sandbox orders with `review_checkout`, KES 0 collected and ordinary APP references/customer copy. They create no SalesRecord and never invoke Pesapal. Accelerated Club qualifying values apply to review purchases only, unlocking tiers at counts 3, 6 and 9; they must never be used as sales revenue.

The requested dispatch login was provisioned only in ignored local review credentials and the review DB, with a hashed database password. Private role logins are in `artifacts/local-preview/LOGIN.txt`; no passwords belong in this document or git. Customer login is for buying; staff intentionally land in their own department. New riders require unique emails and passwords of eight or more characters. Dispatch creates only rider-role accounts and copies its operational scopes; existing accounts cannot be overwritten or promoted.

Preserve unrelated untracked APK and WooCommerce directories. Existing local backend may be running on 8010 and must be restarted to load new routes. Do not erase the review database or stop an unknown listener.

## Review sequence

1. Stop the old preview normally in its terminal and restart `npm run start:go:tunnel` so both API routes and the review flag reload. No mobile staff module redirects to the console.
2. With the private customer account, order any available catalogue cake at its real quoted value and KES 0 due. Repeat three purchases to unlock the next Club milestone/card prompt.
3. Kitchen assigns production, starts preparing, then marks ready. Customer Orders and the inbox update.
4. Dispatch creates a rider from Rider accounts and assigns the order. The rider uses their own login to accept, collect after readiness, start delivery, read cake/message/destination/contact/instructions, then complete with proof.
5. Customer confirms receipt, then rates the experience or returns later. Customer satisfaction is available to admin/staff/ecommerce manager/customer service on mobile and web.
6. The web console is `http://localhost:8010/admin/` when the local backend runs. Select Review orders for review workload; live sales remain independent.
7. Manually inspect small/large phones, larger text, light/dark mode and reduced motion. Check sheet scrolling/dismissal, avatar upload, all role modules, Club prompts, confetti, GPS and notification permissions. These are device acceptance checks, not claims established by unit tests.

## Verification evidence

- `npm test`: 216 passed after customer/native module/web improvements. Includes search cancellation, accessible sheet expansion, live checkout boundaries, review capability gating, segmented web controls and queue counts.
- `npm run typecheck`: passed after native modules and UI integration.
- From `backend/`, `python -m pytest tests/test_review_checkout.py tests/test_logistics.py tests/test_staff_workspace.py -q`: 39 passed. Covers 3/6/9 milestones, full-price/zero-charge orders, stock, idempotency, ownership, cake/accessory sorting, rider provisioning/acceptance and department permissions.
- Review end-to-end API test: passed for order -> kitchen -> dispatch -> rider -> delivery -> customer inbox, with no provider calls, remote push jobs or live sales records.
- Payment/dashboard/catalogue/search/notification/Club regression selection: 62 passed.
- iOS production JS/Hermes export succeeded to ignored `artifacts/local-preview/upgrade-ios`; this proves bundling, not device behavior or an installable App Store build.
- Final receipt/satisfaction API selection: 19 passed (`test_notifications.py`, `test_review_checkout.py`, `test_home_orders.py`, `test_order_experience.py`). Covers owner-only receipt, idempotent confirmation, one satisfaction inbox reminder, receipt required before rating, duplicate review protection, staff feedback permissions and the review delivery flow with cake message/instructions intact.
- Frontend suite rerun after receipt integration: 216 passed; new receipt-prompt renderer test plus web dashboard tests: 5 passed. The receipt test confirms rating controls stay hidden until the customer acknowledges receipt. Typecheck and dashboard JavaScript syntax checks passed.
- Final iOS Hermes export after receipt/satisfaction integration also passed: `entry-00c5e8b692f3cd3dbdfdbb633b3e27b5.hbc` (6.6 MB), in the ignored local preview export directory.
- Implementation commit `f9560bdef601fe1b6be76a2357cdadf81795d5de` pushed to `origin/master`; remote ref verified. This is GitHub evidence, not Render deployment evidence.

## Operational limits

Phone/browser visuals, actual GPS, phone notification permissions, remote push delivery and Render deployment have not been verified here. Only Pesapal was previously reported configured on Render; SMTP and remote push are not established. Local review deliberately disables external providers, while in-app notification records are exercised by API tests. Odoo, AI and real payment activation remain paused.

Earlier separate web-preview launch was rejected by automatic approval review; no browser visual acceptance is claimed. Product tools create simple products and edit existing imported variations, retaining revision/stock validation. No live records were changed. A documentation shell command was also rejected; this handoff was updated through the file-editing tool.

## Customer receipt and satisfaction follow-up

The owner additionally requested explicit customer acknowledgement of delivery, followed by satisfaction feedback. Implemented using existing receipt acknowledgements and private order reviews, with no schema migration. Rider delivery remains separate from customer receipt (`received_at`). Confirming receipt opens the order for optional feedback and creates one inbox reminder, so the customer can return later. Feedback requires receipt acknowledgement and remains idempotent; historical existing reviews stay readable. Admin/staff/ecommerce manager/customer service can access Customer satisfaction on mobile and web. Other departments cannot retrieve these private reviews. Order details show whether customer receipt is confirmed.

## Display comfort follow-up

Owner also requested refined iPhone appearance with True Tone, Night Shift/eye-care display settings, and standard display settings. Preserve the approved Shop structure and product photography. Tune shared neutral surfaces and dark-mode accents, separate filled action colours from text accents, strengthen critical text contrast, respect system Increase Contrast/Reduce Transparency and reduce decorative glow intensity. Do not attempt to detect or override True Tone, change phone brightness, recolour product images, or claim hardware validation from mathematical contrast tests. Verify semantic colour pairs and appearance behavior, and leave an explicit iPhone on/off acceptance matrix.

Additional owner refinements: lighten popup backdrops and use consistent smooth transitions; put Cookies in its own department and exclude accessories/cookies from All cakes on both the server and cached client rendering; centre search loading; refine Pink Simba cards as a school birthday package; improve Club perks/date presentation without changing saved dates or benefit rules. Inspect actual catalogue category/name evidence, including uncategorized accessories and cake names containing accessory words, before changing classification.

Implemented these refinements. Shared sheets now fade with a lighter themed backdrop, use solid content surfaces, and avoid stacking another dim layer for nested panels. Reduced motion disables the transition. Club Rewards/Perks/Dates use the same sheet; perks have separate referral and birthday cards with full rules on demand. Dates show month/day badges and upcoming dates; the add/edit form replaces the list while active. An owner-scoped PUT updates celebration dates, preserving notes; editing clears the old device reminder and asks the member to set a fresh one. Birthday eligibility retains backend rules, including February 29 handling.

Cookies uses the real catalogue category 111 and its existing product image. All cakes excludes cookies and accessories before server pagination and again when rendering cached results. Classification gives genuine cake names/categories precedence over words such as balloons or cookies, while recognizing uncategorized candles and other party items. Search has a centred, reduced-motion-aware loading state in results and predictions. Pink Simba uses a portrait package card in the Home carousel, a package label/detail action in product grids, and the source description's included 3kg cake in the bag. Cookie packs/accessory items use explicit Pack/Item units; prices stay unchanged.

Light canvas is a subtle neutral off-white; dark text accents and filled action colours are distinct so white button labels stay readable. Increase Contrast updates native theme text/edges and removes glass transparency. Product photography and phone brightness/white point remain untouched; decorative Club glow is restrained. Contrast tests cover both appearances and approximate warm shifts; these matrices do not reproduce a calibrated True Tone/Night Shift display. Reference: [Apple display controls](https://support.apple.com/en-ie/109351), [Apple sufficient contrast criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria/).

Refinement backend selection: 24 passed across review checkout/catalogue/Club tests, including cookie filtering before pagination, keeping balloon/cookies-themed cakes, and owner-only valid date edits. Additional Club panel/contrast/catalogue/accessibility renderer selection: 13 passed. Final expanded frontend suite, typecheck and latest iOS bundle checks are being recorded below.

- Final expanded frontend suite: **223 passed** (`upgrade-frontend-final.log`).
- Final `npm run typecheck`: passed (`upgrade-types-final.log`).
- Final iOS Hermes export passed: `entry-56b0e2c4debd6c6e799bccc79f76a548.hbc`, 6.6 MB. Export metadata/assets remain ignored.
- Restarted only the agent-owned isolated API runner to load new routes, retaining the review DB. Real local HTTP checks verified no-charge capability, private customer/dispatch/admin logins and authorized module data; the check sessions were logged out. No business orders were created by these local smoke checks.
- Actual local catalogue check: all **322 cakes across four sorted pages** exclude cookie/accessory categories and uncategorized candles; Cookies returns **six actual products**. The web shell is reachable at `http://localhost:8010/admin/`. An earlier guessed `/dashboard/` path returned 404; use `/admin/`.
- The local backend is current. Reload Expo Go to pick up the native UI; if necessary, stop/restart its existing terminal with `npm run start:go:tunnel`. Private logins remain in ignored `artifacts/local-preview/LOGIN.txt`.

Manual iPhone acceptance matrix: light/dark appearance x True Tone off/on x Night Shift off/on (including warm end), at low/normal brightness; repeat with Increase Contrast, Reduce Transparency, larger text and Reduce Motion. Check product photo fidelity, selected tab/action labels, Club card/perks/date sheets, nested pickers, centred loading and popup dismissal. No physical iPhone visual acceptance is claimed.

## Checkout blocked by missing local fulfilment setup

Follow-up ecosystem expansion, owner-approved delivery/rider tariffs, corporate portal, earnings reports, inventory DIY, coupons, rider details and logo receipt are documented in [ECOSYSTEM_EXPANSION_2026-11-13.md](ECOSYSTEM_EXPANSION_2026-11-13.md). Use that document for the latest implementation/validation details and operational acceptance limits.

The grey Review confirmed total button was reproduced against the running preview: checkout policy and delivery-zone tables were empty, despite an imported catalogue and historical orders. Both pickup and delivery were unavailable. Restored the missing policy and a zero-fee address-based Delivery zone through the authenticated local admin API, after verifying the isolated backend status; temporary admin/customer check sessions were logged out. No customer order or payment was submitted. This is local review configuration, not confirmation of production delivery rates or Maps routing.

The local factory now calls guarded `review_checkout.prepare_checkout` to initialize missing settings on startup, preserving existing operator choices and disabled settings. Production startup does not call this helper and its isolation guard rejects non-review databases before accessing them. Checkout automatically selects a sole delivery area. A disabled review button now has an adjacent explanation for missing setup, a missing route, loading, or recovery; failed option loads offer retry.

Validation: 10 checkout UI/recovery checks and 21 backend review/factory checks passed; typecheck passed. A real HTTP quote through the Expo proxy for Milky Caramel 1.5KG Offers, BlueBerry Pound Cake variation 33459, and Sparkling Candles returned 200 with 3 items, KES 8,250 catalogue total and zero delivery fee. Local capability confirms KES 0 due now. No order/payment was submitted by that check. Reopen Checkout or reload Expo Go to refresh cached options; `npm run start:go:tunnel` remains the startup command.

## Metro file-cache implementation details

Reported error: `Unable to deserialize cloned data` while Metro reads its V8-serialized file map. This is a disposable development cache failure; Metro already falls back to crawling source files. The exact cause (interrupted write, another process, or an incompatible runtime snapshot) is not established.

`scripts/metro-cache.cjs`, configured from `metro.config.js`, places file-map caches in the OS temporary directory with separate namespaces for the project, Node/V8 runtime, and development versus export. It recovers only V8 deserialization failures as cache misses and writes a fresh snapshot after the crawl. Other filesystem errors remain visible. Existing app data, review orders, credentials and dependencies are untouched. No broad cache deletion is performed.

Restart the existing Expo terminal with Ctrl+C, then `npm run start:go:tunnel`. The first crawl in the new namespace can take longer; later runs reuse the cache. The launcher and its isolated backend behavior remain unchanged. Targeted cache/tunnel/launcher checks: 9 passed, including a real damaged DiskCacheManager snapshot followed by a readable replacement. Full frontend suite: **229 passed**. iOS Hermes export passed without the reported cache error at ignored `artifacts/local-preview/cache-repair-ios`, bundle `entry-1b75a10f98f15736f239a1d75e8be63c.hbc` (6.6 MB). Phone connectivity is not established by these checks.


Latest continuation: [UX, marketing, call centre and corporate handoff - 14 November 2026](UX_OPERATIONS_2026-11-14.md).
