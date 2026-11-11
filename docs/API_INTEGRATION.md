# Cake City mobile API integration

The mobile API is `https://cc-mobile-1.onrender.com`. The native app treats it
as the authoritative boundary for account identity and catalogue visibility; it
does not fall back to bundled display products when that service is unavailable.

## Verified live capabilities (2026-09-19)

| Feature | Request | Mobile behavior |
| --- | --- | --- |
| Catalogue | `GET /v1/catalogue/products?page=&per_page=&search=` | Raw current WooCommerce product records. The proxy supports pagination and search; it does not currently forward totals, categories, price/sale filters or sort metadata. |
| Email registration | `POST /v1/auth/mobile/register` | Requires valid email, 8-128 character password, first name and last name (1-80 characters), optional phone. Returns a bearer/refresh session. |
| Email sign-in | `POST /v1/auth/mobile/login` | Returns the same session shape; refresh token remains in native Keychain/Keystore. |
| Session | `POST /v1/auth/mobile/refresh`, `/logout` | Refresh rotates the native session; logout returns HTTP 204. |
| Mobile config | `GET /v1/mobile/config` | Available, but current capabilities do not enable checkout, rewards, delivery or studio ordering. |

`/v1/auth/mobile/google`, account orders, addresses, favourites, rewards,
checkout quotes, payments and delivery routes are not live on the deployment
evidence above. Password recovery is now implemented in source but remains
disabled until private SMTP settings are provisioned; its deployed status has not
been checked. The app does not present unsupported actions as working. Device-
local saved cakes are labelled as local and are resolved against the current
catalogue before display.

Runtime schemas are in `src/features/commerce/contracts.ts`. The API boundary is
in `src/features/commerce/api.ts`; authentication is in `src/auth/api.ts`.

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

- `POST /v1/auth/forgot-password`: `{email, redirect_uri}`. Source accepts only
  `cakecity://reset-password`, stores only a hash of a random 30-minute token,
  throttles repeat sends, and returns the same generic accepted response for
  known/unknown accounts. SMTP delivery uses STARTTLS and runs after the response.
- `POST /v1/auth/reset-password`: `{token,password}`. Source atomically claims
  single-use tokens, invalidates other reset tokens, revokes refresh sessions,
  and disables push devices bound to those sessions. Already-issued access JWTs
  remain valid only until their configured short expiry.
- Recovery remains off by default. Provision
  `PASSWORD_RECOVERY_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`, and `SMTP_SENDER_EMAIL` in the backend's private environment
  only after verifying the sender and delivery service. Production startup
  rejects enabling the feature without the required SMTP settings. See
  `backend/.env.example`. No live email delivery was tested in this workspace.
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
