# Cake City mobile API integration

The native app never calculates a charge locally. Product browsing uses the real
Cake City public WooCommerce Store API. Account, quoting, orders, rewards and
payments use `EXPO_PUBLIC_API_URL`. A missing API has an explicit unavailable state.

The earlier production audit recorded inspection of a sibling FastAPI backend.
That sibling path is absent in the current workspace. The contracts below are
implemented by this client and covered by contract tests; they are **not evidence
that the corresponding backend is deployed or reachable**.

## Existing integration contracts

| Feature | Request | Important behavior |
| --- | --- | --- |
| Catalogue | `GET https://cakecity.co.ke/wp-json/wc/store/v1/products` | 24 items/page; server search, category, sale, price filters and sorting. Prices use the declared currency minor unit. |
| Categories | `GET /products/categories` on the Store API | Parents, children and real category imagery. |
| Product | `GET /products/{id}` on the Store API | Stock, attributes, variations, images and price. Saved items resolve through `?slug=`. |
| Email identity | `POST /v1/auth/mobile/register`, `/login` | Validated bearer session; refresh token in native Keychain/Keystore. |
| Google identity | `POST /v1/auth/mobile/google` | Exchange `{id_token}`; requires actual Google client IDs and native signing setup. |
| Session | `POST /v1/auth/mobile/refresh`, `/logout` | Rotating `{refresh_token}`; logout supports HTTP 204. Concurrent 401s share one refresh. |
| Quote | `POST /v1/checkout/quote` | Product slug, quantity, size, message, add-ons, fulfilment and optional configuration IDs. No client amount. |
| Payment | `POST /v1/payments/intents` | Preserve `mpesa`, `card`, `wallet`; `Idempotency-Key`, checkout, customer and address. |
| Payment status | `GET /v1/payments/intents/{id}` | `X-Payment-Secret`; only server `paid` confirms success. Returning from a hosted page is insufficient. |
| Orders | `GET /v1/account/orders`, `GET /{reference}` | Authenticated account ownership, totals, timeline, driver location and ETA when supplied. |
| Reorder | `POST /v1/account/orders/{reference}/reorder` | Available lines with current prices/configuration plus explanations for unavailable lines. |
| Addresses | `GET/POST /v1/account/addresses`, `PUT/DELETE /{id}` | Persisted addresses; default-address state belongs to the server. |
| Favourites | `GET /v1/account/saved/cakes`, `PUT/DELETE /{slug}` | Account-backed saved products. |
| Rewards | `GET /v1/account/rewards`, `/rewards/activity` | Account balance, tiers, wallet, referral and transaction history. |
| Redemption | `POST /v1/account/rewards/redeem` | `{points}` and idempotency key; server enforces redemption limits and calculates wallet credit. |
| Moments | `GET/POST /v1/account/moments`, `DELETE /{id}` | Birthdays/events and requested reminder days. The backend schedules reminders. |
| Inbox | `GET /v1/account/notifications`, `POST /{id}/read` | No fabricated notifications. |
| Preferences | `GET/PUT /v1/account/notifications/preferences` | In-app, email, push, SMS and WhatsApp preferences. |
| Courier chat | `GET/POST /v1/account/orders/{reference}/delivery/messages` | Available only with server-provided delivery tracking. |

Runtime schemas are in `src/features/commerce/contracts.ts`. API calls are in
`src/features/commerce/api.ts`; authentication is in `src/auth/api.ts`.

## Required additive backend capabilities

These endpoints were identified as absent in the earlier audit. Enable each
capability only after implementing and validating its server behavior.

### `GET /v1/mobile/config`

Return `checkout_contract`, `capabilities`, `branches`, `campaigns`, and `studio`.
Capability flags are `distance_delivery`, `studio`, `coupons`, `native_push`, and
`variation_checkout`. Branch coordinates, contact details and fulfilment
availability must be actual Cake City data. Campaigns include active dates,
eligibility, minimum order, remaining usage, branch/product/category restrictions,
discount type and value. The server must enforce eligibility again at checkout.

Studio configuration specifies a version, base product/price/image, message limit,
groups, required/multiple selections, available materials, prices, incompatible
material IDs, transparent image layers and layer order. Use actual approved
materials and assets. An estimate is explanatory until the server quotes it.

### `POST /v1/custom-cakes/quote`

Accept `{configuration_version, selections, message, branch_id?}`. Validate every
option and incompatibility against the current configuration. Return
`{id, expires_at, product_slug, name, subtotal, selection}`. The client puts this
quote ID in the bag. Persist the configuration and material breakdown with the
order; do not accept an arbitrary client subtotal.

### `POST /v1/delivery/quote`

Accept `{branch_id, latitude, longitude, items}`. Compute route distance through
the configured routing/delivery provider, then apply server-owned distance bands,
zones, surcharges and discounts. Return `{id, branch_id, distance_km, delivery_fee,
currency: "KES", estimated_delivery_minutes, expires_at, provider}`. Bind this
quote to the destination, branch and items and validate it again during payment.
The local branch distance calculation only sorts nearby branches; it never prices
delivery. Current checkout location entry uses GPS at the delivery address.

### Checkout/payment extension requirements

- The quote must echo `delivery_quote_id` and use the quoted delivery fee.
- Echo `applied_coupon` only after applying and checking the code.
- Set `accepted_configuration` only after validating the branch, WooCommerce
  variation and/or studio quote. Ignore no configuration fields silently.
- Return `expires_at` for expiring quotes. Reconcile every line and the full total.
- Payment must reprice and revalidate the same inputs atomically, preserving the
  existing M-Pesa/Flutterwave providers and provider callbacks.
- Reserve idempotency keys before provider calls; replay the original result.
- Bind the payment-status secret to its intent and account. Persist provider
  events, including failure, cancellation and manual-review states.
- The earlier audit described fixed delivery fees and ignored coupons in the old
  quote endpoint. The mobile client deliberately prevents those responses from
  authorizing distance delivery or an unconfirmed promotion.

### Password recovery and native notifications

- `POST /v1/auth/forgot-password`: `{email, redirect_uri}`. Allowlist
  `cakecity://reset-password`, issue a short-lived single-use token and return
  a generic response regardless of account existence.
- `POST /v1/auth/reset-password`: `{token,password}`. Invalidate used reset tokens
  and apply the account's session-revocation policy.
- `POST /v1/account/notifications/devices`: `{token,platform,provider:"expo"}`.
  Bind registration to the authenticated customer, reassign a reused token safely,
  honor preferences, and remove invalid tokens when processing delivery receipts.
  Backend dispatch, token revocation/rotation, FCM/APNs credentials and actual push
  delivery need release testing. The notification deep-link allowlist prevents
  arbitrary URL navigation.

## Release verification against the real service

Use dedicated test accounts and provider sandbox credentials. Verify registration,
restart/session refresh, account isolation, recovery emails, quote repricing,
unavailable stock, expired delivery/studio quotes, coupon eligibility, one order
per idempotency key, payment success/failure/lost response, order ownership,
reorder changes and notification preferences. Do not run a real charge as a smoke
test. The repository tests use isolated fixtures; the application ships no demo
customer, fake order, fabricated reward or fallback product catalogue.
