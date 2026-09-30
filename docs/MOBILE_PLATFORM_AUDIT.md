# Cake City mobile platform audit

Audit date: 2026-09-25  
Scope: the Expo SDK 57 mobile client and its bundled FastAPI mobile proxy. This
document distinguishes verified client behavior from backend work that remains
required. It does not treat presentation-only or device-local data as live
commerce data.

## A. Current architecture

- **Runtime and navigation:** Expo SDK 57, React Native 0.86 and stable Expo
  Router tabs. The root stack in `app/_layout.tsx` provides safe-area,
  error, auth, query, toast and notification boundaries.
- **Platform experience layer:** OS-backed connectivity drives TanStack Query's
  reconnect state without a heartbeat. `src/design/` centralizes short,
  reduced-motion-aware motion intent and platform haptic semantics; the five
  primary tabs retain Android system-back behavior and iPad-safe layouts.
- **State:** TanStack Query holds server responses in memory; Zustand persists
  the active bag and preferences in AsyncStorage. Refresh credentials use
  SecureStore and access tokens remain in memory.
- **Catalogue:** `src/features/commerce/api.ts` validates live mobile-proxy and
  WooCommerce Store API records with Zod. `expo-image` provides disk/memory
  image caching and visible-rail prefetching.
- **Active checkout:** WooCommerce Store API creates the authoritative cart,
  then starts the existing Pesapal handoff. The app never sends a local total
  to authorize payment. Cart-token and payment recovery are encrypted and
  scoped to the signed-in account; guest handoffs intentionally do not survive
  an app/account boundary on a shared device.
- **Order/private data:** local tracked orders are SecureStore-backed and
  account-scoped. Guest customers retain their official secure receipt during
  the active handoff but cannot expose its private key to a later device user.
- **Bundled backend:** FastAPI currently provides health/config, catalogue
  proxying and email authentication. It does not yet own delivery, payments,
  orders, rewards, reviews, referrals or notification campaigns.

## B. Current problems

1. The payment/cart creation path was previously mounted as a refetchable
   query, which could replay server writes after focus or reconnect.
2. The server does not expose the authoritative endpoints needed for delivery
   slots, account-wide orders, loyalty, reviews, recommendation ranking or
   remotely managed home content.
3. Product/category discovery relies on hard-coded category IDs and fallback
   scans while the proxy lacks cursor pagination, product-by-slug and ranked
   search endpoints.
4. Some routes are intentionally honest unavailable states rather than live
   features; loyalty is not connected to a real points ledger.
5. Two cart/API generations and several unused UI components remain in the
   repository. They should be removed only after import-level migration and
   payment regression coverage are complete.
6. The public product payload lacks an image-rendition contract, so the client
   cannot yet guarantee thumbnail/medium/full selection for every Woo image.
7. Universal links, App Intents/Siri, Android widgets and actionable system
   notifications require signed native targets plus web/domain and backend
   support; the app scheme and share-sheet handoff alone cannot enable them.

## C. Performance bottlenecks

- A fixed 900 ms JavaScript launch overlay delayed usable UI.
- Home previously waited on one catalogue result before meaningful live product
  content appeared; catalogue requests allowed a 45-second timeout.
- Cold product/category lookups can scan multiple catalogue pages because the
  mobile API is not yet normalized for mobile access.
- The Store API requires ordered Cart-Token writes, so a 30-line bag can need
  31 requests until the backend supplies an atomic mobile-cart endpoint.
- Query data was memory-only and the client had no recovery UI driven by an
  observed transport failure.
- Product detail currently mounts a full gallery and related-product work too
  eagerly; image rendition contracts are not available from the backend.

## D. Recommended architecture

```text
Expo Router screens
  -> feature hooks + view models
  -> Query cache / persisted read-only catalogue cache
  -> typed mobile BFF (/v1/mobile/*)
  -> WooCommerce, delivery, payment, loyalty and notification services

All checkout pricing, stock, delivery eligibility and payment state
  -> one server-owned checkout session
```

- Keep UI selections and an offline bag on-device, but revalidate every price,
  stock level, coupon, delivery option and total on the server before payment.
- Replace client scans with a mobile BFF supporting cursor pagination, fields,
  ETags, search ranking and a small home aggregate.
- Use feature flags returned in remote mobile configuration. A feature is
  hidden or presented as unavailable until its server authority exists.
- Give all image records `thumbnail`, `medium` and `full` HTTPS CDN variants,
  dimensions, alt text and an optional placeholder hash.
- Treat a deterministic client query parser as preference extraction only. A
  future semantic/AI service receives structured intent then confirms product,
  inventory, delivery and price with authoritative services before an action.
- Model order status as an event timeline. Kitchen/delivery stages appear only
  when an order service publishes those explicit states; no client timer may
  simulate baking or driver progress.

## E. Feature implementation plan

1. **Foundation (in progress):** payment regression safety, app startup,
   request policy, cached browse recovery, Search navigation and telemetry
   foundations.
2. **Core commerce:** mobile home aggregate, server search, collection
   filters, efficient product detail gallery, product quick-add only for
   simple configured products, cart/checkout consolidation.
3. **Delivery and orders:** authoritative quote/slot service, saved addresses,
   server order history, timeline and one-tap reorder.
4. **Customer experience:** synced favourites, verified reviews, notification
   preferences and customer-controlled celebration reminders.
5. **Retention:** server points ledger, reward redemption, referrals,
   campaigns and app-exclusive offers behind flags.
6. **Differentiation:** server-quoted custom cake builder, layered preview,
   gift mode and corporate/recurring ordering.
7. **Advanced:** only after reliable data exists—AI recommendations, assistant,
   voice, AR and 3D rendering.

### A-List experience-layer decisions

- **Completed client foundations:** context-safe Continue Shopping based only
  on signed-in account views; deterministic preference parsing for KES budget,
  occasion, flavour and date; native product sharing; an authoritative order
  journey mapper; OS network state; a unified haptic/motion contract.
- **Deliberately deferred:** semantic ranking, delivery promises, AI actions,
  Siri/App Intents, widgets, Live Activity publishing and universal links.
  Each requires server state or native entitlement/domain work and must not be
  simulated by the app.

## F. Files modified in this implementation slice

- `app/_layout.tsx` — removes the fixed JS launch blocker and exposes offline
  recovery feedback.
- `app/(tabs)/_layout.tsx`, `app/(tabs)/search.tsx` — establish Home, Shop,
  Search, Orders and Account as the primary navigation.
- `HomeScreen.tsx`, `ShopScreen.tsx`, `search-intelligence.ts` — make Search a
  primary task and add transparent typo/abbreviation suggestions that still
  query live records.
- `QueryProvider.tsx`, `api/client.ts`, `website-checkout.ts` — add bounded
  backoff, observed network status, privacy-safe performance metrics and an
  explicit checkout preparation boundary.
- `ProductScreen.tsx`, `OrdersScreen.tsx` use the system share sheet and an
  order journey that reflects only an authoritative Woo/order status.
- `website-checkout-session.ts`, `website-order-history.ts`, `AuthProvider.tsx`
  scope private recovery/order records to the rightful signed-in account and
  purge legacy unscoped records.
- `CheckoutScreen.tsx` — replaces a write-producing query with a mutation and
  Pesapal recovery state.
- `api.ts`, `catalogue-cache.ts` — persist TTL-bound live catalogue records
  strictly for read-only transport-failure recovery.

## G. Files created

- `src/features/commerce/website-checkout-session.ts` — short-lived,
  SecureStore-backed Cart-Token recovery and persisted payment handoff.
- `src/platform/connectivity.ts` and `src/components/ui/OfflineNotice.tsx` —
  request-observed connectivity state without a wasteful heartbeat.
- `src/observability/commerce-events.ts` — bounded, PII-filtered event and
  performance buffers with a consent-aware app-owned sink boundary.
- `src/features/commerce/search-intelligence.ts` — safe local search term
  correction; it never fabricates results.
- `tests/website-checkout-safety.test.cjs` — guards Cart-Token/fingerprint and
  mutation-only checkout setup.
- `docs/PERFORMANCE_BUDGET.md` — measurable targets and instrumentation plan.

- `src/features/commerce/commerce-intelligence.ts` is a deterministic
  preference parser for a future server/AI search boundary; it carries no
  price, availability or product assertion.
- `src/features/commerce/order-journey.ts` maps backend status to a timeline
  without inventing kitchen or delivery progress.
- `src/design/` provides cross-platform motion accessibility and haptic intent
  primitives.
- `tests/commerce-intelligence.test.cjs`, `tests/order-journey.test.cjs` cover
  deterministic query facets and no-fabricated-progress behavior.

## H. Required API changes

These are proposals, not client-side claims of availability:

| Endpoint                            | Purpose                                                       | Cache policy                       |
| ----------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `GET /v1/mobile/home`               | compact, remotely configured rails and campaign references    | 5 min SWR, ETag                    |
| `GET /v1/catalogue/products`        | cursor pagination, field selection, filters and ranked search | 5 min list cache, ETag             |
| `GET /v1/catalogue/products/{slug}` | one normalized product and media variants                     | 15 min cache, invalidate on update |
| `POST /v1/checkout/sessions`        | atomic cart, price, stock, coupon and delivery quote          | no client total; idempotency key   |
| `POST /v1/delivery/quote`           | one authoritative zone/date/slot/cutoff calculation           | short-lived quote only             |
| `GET /v1/account/orders`            | server account history and timeline                           | brief cache + status invalidation  |
| `GET /v1/account/rewards`           | points balance, ledger and available rewards                  | account cache, ledger invalidation |

| `POST /v1/catalogue/search/interpret` | authoritative structured/natural-language product and delivery search | no cached promises; ranked results short TTL |
| `GET /v1/orders/{id}/events` | explicit preparation/delivery state transitions for the order journey | brief cache plus push invalidation |

## I. Required database changes

- Product media variants/dimensions/hash and an index on mobile catalogue
  filters/search fields.
- Cursor-friendly product update index such as `(published, updated_at, id)`.
- Server checkout session and idempotency tables; never calculate a payment
  amount from a device payload.
- Delivery zones, branches, preparation calendars, cutoff rules and delivery
  slots in one authoritative service/table set.
- Orders/events, loyalty ledger (append-only), rewards/campaign eligibility,
  saved addresses, review verification and notification preferences.
- Audit-safe event tables with minimized metadata and retention policies.
- Customer signal records (views, purchases, favourites, occasion preference)
  with customer deletion/retention controls; never use device-global behavior
  as a different account's personalization input.

## J. Testing strategy

- Keep unit/source-contract tests for schemas, pricing, variations, cache
  boundaries and payment recovery.
- Add API contract tests against a staging mobile BFF for pagination, ETags,
  search corrections, quote expiry and all delivery rules.
- Add Woo/Pesapal sandbox tests: Cart-Token persistence, mixed variation bag,
  redirect, cancellation, lost response, webhook confirmation and receipt.
- Run mobile E2E on a current iPhone, older supported iPhone, Android
  flagship, mid-range Android and low-memory Android under Wi-Fi, 4G and poor
  network profiles.
- Test screen reader labels, Dynamic Type/font scale, reduced motion, keyboard
  and Android back behavior for every payment and cart action.
- Test Share, deep links and system-notification routes on fresh signed builds.
- Add account-switch and guest-device tests around private checkout recovery
  and order keys, alongside the Pesapal redirect/lost-response sandbox suite.

## K. Performance benchmarks

See `docs/PERFORMANCE_BUDGET.md`. The targets are engineering budgets, not
claims about the current production infrastructure. Fresh device/profile
measurements are still required after a native rebuild.

## L. Deployment strategy

1. Upgrade SDK-compatible Expo patch packages using the Expo SDK 57 checker,
   then run typecheck, tests and release checks from a clean non-OneDrive
   native build directory.
2. Deploy the mobile BFF/API changes behind feature flags; load test and add
   database indexes before enabling filtered/search-heavy screens.
3. Run staged internal builds with real HTTPS APIs and a Pesapal sandbox path.
4. Verify a fresh signed Android APK/AAB and iOS archive on physical devices;
   old dev-client evidence cannot prove native-module compatibility.
5. Gradually enable server-authoritative delivery, orders and rewards only
   after telemetry/error budgets are within target.
6. Before universal links or system surfaces are announced, publish and verify
   `apple-app-site-association` and Android `assetlinks.json`, add the signed
   associated-domain/intent-filter configuration, and open exact
   product/order/promotion routes on physical devices.
