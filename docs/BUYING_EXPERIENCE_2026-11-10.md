# Buying experience and order visibility — 10 November 2026

This pass addresses the customer feedback on crowded Club screens, discovery,
test-product placement, order visibility, kitchen readiness and dispatch controls.

## Customer experience

- Home, Shop and Club expose celebration creation through a header sparkle icon.
  Its introduction glows briefly, respects reduced motion, pauses off screen and
  remembers discovery on this installation. A notification bell indicates unread
  recent order updates.
- Home search and Shop show up to four real catalogue predictions after a short
  debounce. Common spelling corrections are offered without inventing products.
  Predictions link to product details; full search retains sorting and filters.
- The staff test cake is a labelled product tile in Shop's All collection, beside
  normal products. Its separate simulation flow still charges no money. The
  repeated test panels on Home, Bag, Checkout and Account have been removed.
- Club begins with the interactive member card, one next-tier goal and a compact
  Rewards / Perks / Dates row. Tier details and reward rules open on demand. The
  card flip, sheen and progress animation remain; the sheen pauses off screen.
- Payment and milestone confetti share a two-sided burst with staggered ballistic
  arcs and fluttering ribbons. Animation uses one clock, runs native transforms
  on phones, does not block interaction and respects reduced motion.

## Orders and notifications

- Home has a visible order shortcut and highlights an active order from the
  customer's recent orders. Orders has paginated history, clear status labels,
  a tracking action and a notification shortcut.
- The order detail displays the recorded kitchen-to-delivery timeline, assigned
  rider contact where available, delivery-task status, receipts and feedback.
  Tracking polls while its screen is active. It does not claim live GPS or invent
  an ETA.
- A single foreground inbox poll drives the unread bell and a tappable banner
  when a new update arrives. It pauses in the background, establishes a baseline
  on account changes and refreshes order queries. Existing notifications remain
  in the inbox after a banner disappears. Cold sign-in does not replay old alerts.
- Kitchen readiness explicitly says ready for dispatch for delivery orders, or
  ready for collection for pickup orders. Odoo-imported kitchen events now pass
  through the same transactional tracking and notification path as local events.
- Dispatch includes pickup handover, rider acceptance, collection, departure,
  proof-backed delivery, cancellation and reopening a failed assignment. Backend
  readiness, plant scope, revision and quantity protections remain enforced.
  A missing production assignment links back to Kitchen. Route destinations are
  used when an order has a quoted delivery address.

## Performance changes

- Shop pages request 24 products instead of 100. Suggestions request four.
- Cold product links use ID or exact-slug queries instead of scanning catalogue
  pages. The backend applies these filters before loading product payloads.
- Notification consumers share cached data with a single polling observer.
  Tracking and card decoration pause when their screens are inactive.
- Local review keeps Metro's transform cache by default. Use
  `npm run preview:local -- --clear` only when an explicit cache reset is needed.

These changes are concrete payload/work reductions; they are not a measured
native frame-rate claim. Expo development mode, a tunnel, Render cold starts and
device/network conditions still affect perceived speed.

## Verification and release boundary

Final checks on **11 November 2026**:

- **178 frontend tests passed**; TypeScript and changed-file formatting passed.
- **82 targeted backend tests passed** across payments, catalogue, search,
  logistics, notifications, Odoo and customer order experience. The final focused
  three-test order-experience run also passed after adding the Odoo echo guard.
  The backend run reports one upstream Starlette/AnyIO deprecation warning.
- A real local browser/API walkthrough passed predictive Home/Shop search,
  spelling correction, product navigation, inline test-product checkout, kitchen,
  dispatch assignment, rider delivery, customer notifications, order links,
  feedback, foreground readiness alerts and pickup handover. No runtime errors
  were recorded. Club passed 320/390/430/1280px overflow checks; checkout and
  completed orders passed 320/390/1280px checks. Screenshots were visually reviewed.
- Delivery reference: `APP-TEST-20261111-0D37E5FF5DCA4408`. Foreground readiness and
  pickup reference: `APP-TEST-20261111-3241F6F01097400F`.
- Evidence: ignored local `artifacts/local-preview/browser-verification.json` and
  `experience-*.png`. The payment confetti now renders in the root overlay, so both
  cannons remain visible outside the order content column on wide screens.
- Staged whitespace and credential-pattern checks passed. No schema migration or
  dependency upgrade is required for this pass.

The local preview uses a separate SQLite database and no live payment or remote
push calls. Source changes and a GitHub push do not establish a Render deployment
or an installed phone build.

Foreground banners and the inbox work independently of remote push. Background
phone alerts require an installed Cake City build, permissions, FCM/APNs setup,
private Expo push configuration and a running deployed worker with the same
database as the API. Follow [NOTIFICATIONS.md](NOTIFICATIONS.md); the existing
Render blueprint provisions the API only. Test orders intentionally stay in the
inbox and do not send remote notifications or request real fulfilment.

The earlier super-app audit remains a gap list, not a promise that every feature
from researched apps has been implemented. Native acceptance and the other release
blockers in [MOBILE_FINISHING_2026-11-10.md](MOBILE_FINISHING_2026-11-10.md) still apply.
