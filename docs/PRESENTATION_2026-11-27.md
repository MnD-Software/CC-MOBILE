# Mobile presentation handoff - 27 November 2026

## Scope

Preserve the accepted customer and departmental UI. Prepare Android and iOS builds, hosted no-charge checkout, and one fuller celebration. Odoo and AI remain paused.

## Changes

- Full payment/reward celebrations now contain 5,000 pieces, using one offline canvas inside the existing WebView dependency on phones. Web uses a sandboxed iframe. Side cannons and a broad falling curtain share a nine-second lifetime; compact effects retain 108 native pieces. The effect does not intercept touches, respects existing reduced-motion gates, stops on background, and releases its surface on unmount.
- `HOSTED_TEST_CHECKOUT_ENABLED=true` enables no-charge ordering through the normal `/v1/app-orders` endpoint. The mobile app discovers this through checkout configuration; it needs no public test flag. Current prices, discounts and totals remain visible. The confirmation action explicitly states KES 0 due now.
- Orders retain a separate test channel, no live sales ledger entry, and zero collected on the receipt. Kitchen, dispatch, rider, customer tracking, in-app inbox and three-purchase review milestones use the existing review workflow. External payment submission is blocked while the hosted switch is enabled. Existing review notifications remain in-app; no remote push is claimed by this mode.
- Quotes bind to the checkout mode. Switching modes requires a new quote rather than silently converting a KES 0 request into a live payment. Idempotency, customer ownership, stock and coupon checks remain enforced.
- Odoo must be disabled during hosted testing. Database, authentication and production CORS/rate-limit requirements remain enforced.

## Render setup

The blueprint now declares `HOSTED_TEST_CHECKOUT_ENABLED=true`. For an existing service configured manually, **set that environment variable in Render and redeploy the latest backend commit**; changing a YAML file does not change an existing service automatically. Keep `ENVIRONMENT=production`, the existing persistent database and private JWT/Redis configuration. Keep `ODOO_ENABLED=false` and `ODOO_LOYALTY_AUTHORITY=false`.

Verify `GET /health` returns `status: ok`, then `GET /v1/payments/pesapal/config` returns `test_checkout: true, available: true`. If `catalogue_setup_required` is true, review the existing checkout policy in Admin; this change does not overwrite the operator's pricing or fulfilment settings.

To restore payments, set `HOSTED_TEST_CHECKOUT_ENABLED=false` and redeploy. Existing test orders cannot be charged through Pesapal. Review current Pesapal credentials/policy and submit a newly quoted order for any later live payment test.

## Presentation route

1. Sign in as a customer. Browse the catalogue, save a cake and open DIY. Keep the live cake visible while choosing flavour, size, icing and decoration.
2. Add an order, select pickup/delivery and an available slot, select an eligible coupon, review the total and place with KES 0 due now. Show the celebration, receipt and Club progress.
3. Sign in as production, progress the order through preparation and ready.
4. Sign in as dispatch, assign a rider. The rider accepts, collects and progresses delivery. Demonstrate customer tracking and in-app updates.
5. Customer acknowledges receipt and leaves feedback. Show completed order history.
6. For the staff overview, select **Review orders** to view the test queue; live sales remain separate. Demonstrate corporate and marketing as separate role workspaces without sending real campaigns or payouts.

## Release boundaries

Android requires an APK build containing these changes. iPhone installation requires valid Apple signing/provisioning and distribution; an unsigned IPA or simulator build is not an installable iPhone release. Neither a successful JavaScript export nor an EAS upload proves phone performance. Record actual build results and links below before claiming readiness.

No private credentials belong in this document, source control or mobile build. No live charge, campaign, external message or rider payout was authorised as part of validation.

## Verification results

- Baseline: TypeScript and all 292 frontend tests passed.
- Baseline operational backend pass: 43 tests passed, covering authentication races, purchase cycle, review checkout, logistics, home orders, DIY and categories.
- Hosted checkout/Pesapal/review/production guard pass: 57 tests passed, including new no-charge, idempotency and mode-switch protections. Providers were mocked.
- Targeted frontend pass: 10 tests passed, including canvas lifetime/density, reduced motion and checkout recovery.
- Canvas visual captures at 320 x 568 and 430 x 932 rendered without browser exceptions. These are browser checks, not native phone performance results.
- Final platform export/build status is recorded after completion.

## Pink neon DIY header shortcut

Added a shared labelled DIY badge to the customer browse headers, standard page headers, product details and the compact studio header. It navigates directly to `/custom` without stacking another studio when already there. The neon glow uses one native animation, pauses when the screen is inactive, and stays static for reduced motion. Department-only accounts retain their existing navigation permissions.

TypeScript and all 293 frontend tests passed. A web export compiled. Browser checks passed on Home, Shop, Orders, Profile, Club and DIY at 320 and 430 pixels: one shortcut per header, no horizontal overflow and no runtime exceptions. Home and studio screenshots were inspected. Small headers wrap their actions rather than cutting off controls. Native phone appearance still needs device review.

This shortcut was added after Android build 28 was submitted; it is available from the updated Expo Go source and needs a later installed build to appear in an APK. No additional EAS build or iOS signing attempt was started for this change.

Follow-up: Home now says "YOUR CAKE PLAYGROUND / Your cake. Your way." and speaks directly to the customer about their flavours, colours and finishing touches. Browse headers use balanced left/right columns to keep the neon DIY badge on the screen centreline; the bag sits beside search. Eleven targeted navigation/search/catalogue tests, TypeScript, a fresh web export and 12 browser layout checks passed. Screenshots at 320 and 430 pixels were inspected; the shared browse-header badge was verified within two pixels of the centreline.

## Presentation polish: colour, loading, DIY, checkout and receipts

- Shared Cake City brand tokens now replace duplicated pink values across common controls, navigation and profile accents. Inspiration uses the same pink surfaces as the rest of the app; cake colours and loyalty tier palettes remain intentional content colours.
- All general waiting indicators use one Cake City icing-and-candle loader, including buttons, search, account restoration and payment loading. Motion pauses in the background and respects reduced motion. Image skeletons remain passive placeholders.
- The header DIY badge is filled edge to edge, uses the shared pink gradient, and has no pale border. Shared buttons use borderless fills without the thin decorative highlight; secondary outlined actions now have a soft pink surface.
- DIY addresses the signed-in customer by first name. Inspiration starts with the photo chooser above the celebration details. Other replaces Just because and reveals a custom occasion field. Photo permission and picker failures are handled without losing the brief. Photos remain local until explicitly shared.
- Bag actions are now Checkout and Keep shopping, side by side. The redundant support-order and coupon-management buttons were removed; checkout coupon selection is retained.
- Checkout settings have an account-scoped query, a longer cold-start timeout and one retry. Pickup and delivery choices remain visible while loading, and failures offer an adjacent retry. A pickup branch is required before quoting; the distance-based pickup path retains its route quote requirement. Branch selection has an independently scrolling list and fixed Done action.
- The 5,000-piece offline confetti canvas now launches from both sides. The old side calculation sent every cannon particle left. Motion now includes layered drift and ribbon highlights.
- Receipt exports use the shared palette, embedded logo, a pink header accent, clearer customer/collection blocks and a distinct total/amount-collected panel. Print styling removes the screen frame; tax disclaimers, escaping, immutable totals and zero-payment disclosure remain intact.

Browser review covered Home, Shop, Orders, Profile, Club and DIY at 320 and 430 pixels. The inspiration chooser was visible without scrolling at both widths, and Other revealed its occasion field. Receipt previews at both widths loaded their embedded logo without horizontal overflow. These are browser checks; installed Android and iPhone appearance/performance still require device review. The owner preview was not restarted. Apple signing remains on hold for the CEO.

Final follow-up: the compact studio header now balances equal left/right columns so the DIY badge stays centred even when New appears. Search no longer animates in its input and suggestions as well as its results: suggestions show quiet status text and the results area owns the single branded animation. The branded cake animation now has a gentle rocking bounce, candle flicker and three floating sprinkles, using one animation clock.

Validation: all 298 frontend tests passed; 19 targeted loader/search/DIY/contrast checks passed after the final motion and search changes. TypeScript and a fresh web export passed. Browser search-throttling and final centring checks are recorded after completion below. No physical-device performance claim is made.

Customer essentials follow-up: customer standard headers and the DIY header now reuse the same cart component, icon, count and navigation as catalogue and product pages. Staff-only workspaces do not acquire customer shopping controls. Search suggestions render below the search/cart row, fixing the screenshot where the bag was vertically centred beside the whole suggestion list. Suggestions are height-bounded and independently scrollable. The loader now draws a shaded cake with three flickering candles and floating sprinkles using gradients and a single native animation clock; it does not add a GPU scene or network asset.

Final browser pass: 12 route/width checks passed with the DIY shortcut centred on the studio at both 320 and 430 pixels. A throttled search rendered exactly one Cake City loader. Inspiration remained above the fold, Other revealed the personal occasion field, and no browser runtime exceptions were recorded. TypeScript and the final web export passed. The loader is a lightweight shaded illustration with depth, not a real-time 3D model.

## Notification and glass polish

The inbox now uses shared glass cards with one accessible tap target, an unread dot, a compact timestamp, order reference and a contextual icon. Only confirmed delivered/received/completed events use green; delivery delays and rider assignment never imply completion. Existing read acknowledgement, role-aware routes, pagination and notification preferences remain connected. Errors opening an update are visible outside the collapsed preference section.

Floating status messages now use a compact glass capsule with a soft entrance, a Cake City pink icon and readable themed text. They remain touch-through, have no dimming backdrop, and retain the existing four-second lifetime and accessibility announcement. Reduced motion suppresses the entrance.

Shared glass surfaces have a broad, soft sheen on the Android and web fallback without per-card Android blur or sharp reflection lines. Shared buttons and sheets use a restrained sheen; dark mode lowers the highlight intensity. High contrast and reduced transparency keep solid surfaces. A failed transparency-preference lookup falls back conservatively. Narrow standard headers put the heading below the logo/actions so long words are not squeezed between shortcuts.

Validation: 300 frontend tests passed, followed by 14 targeted notification/accessibility/glass/contrast tests after the final refinements. TypeScript and a web export passed. Notification fixtures were injected only into the local browser for visual review; no real notification was sent or customer record modified. Browser screenshots at 320 and 430 pixels were checked for overflow and runtime errors. Native phone appearance remains to be reviewed. These changes postdate Android build 88d809a0-5074-4a79-8ef3-ded95a42a8e0 and need a later APK to appear in an installed Android app.

## Completed-order actions, confirmation and tracking refresh

Completed order cards now place Reorder next to a green View order button. Closed unsuccessful orders keep their ordinary view action and do not show a completed-order reorder shortcut. Reorder uses the existing authenticated server flow to recheck current products/prices, locks duplicate taps, adds the validated bundle to the bag and opens the bag; it never charges or places a replacement order automatically. A late result after account switching or screen unmount cannot add another customer's items. Receipt acknowledgement remains a separate action below the pair.

Checkout confirmation now uses a branded glass card with a status seal, fulfilment-specific guidance, order reference and clearer value/amount-collected rows. Unverified payment states still say saved rather than confirmed, and the server-verified confetti trigger is unchanged. Shared success actions use the accessible success palette. Order-history cards also use the shared glass surface.

The glass treatment now uses more transparent notification tints, diagonal reflections and the clear native glass style on supported devices. Solid high-contrast/reduced-transparency fallbacks remain opaque. Android retains the lightweight fallback instead of costly per-card blur; native Liquid Glass is device-dependent and is not claimed to be identical on Android.

Tracking keeps the same refresh icon and data on screen. Automatic polling does not animate the button; a deliberate tap rotates it subtly while its request runs, prevents duplicate requests and respects reduced motion. A refresh error keeps the last known tracking details visible with an inline retry explanation instead of replacing the order with an error page.

Validation: 303 frontend tests passed, followed by nine focused reorder, refresh, glass and accessibility checks after the opacity fallback refinement. TypeScript and the web export passed. Local browser fixtures at 320 and 430 pixels confirmed the green view action and reorder action share one row without overflow or runtime errors. No real reorder, charge or customer update was made during browser QA. Installed apps need a later build to include these changes.
