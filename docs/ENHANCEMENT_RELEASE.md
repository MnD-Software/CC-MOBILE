# Cake City enhancement release - 7 October 2026

## Delivery state

This is an implementation in the mobile repository and its existing backend. It has not been deployed to Render. The six-phase roadmap is not complete.

Android preview 0.2.4 (code 19) was submitted to EAS as `f3bccf4e-856d-48f6-8229-ccba83d40401` under `marcos_noel23/cakecitymobiledev`. Submission alone does not prove completion or installed-device acceptance. Build page: https://expo.dev/accounts/marcos_noel23/projects/cakecitymobiledev/builds/f3bccf4e-856d-48f6-8229-ccba83d40401.

EAS verified status: FINISHED on 7 October 2026 at 09:56 Nairobi time. APK: https://expo.dev/artifacts/eas/NZfCntmgsnBfFJLbTL8TYjnLwu4Zsnj6uaF8FhMgZ0w.apk. Installed-device acceptance remains outstanding.

The user will deploy the prepared backend package and configure server-side WooCommerce credentials. Package: `artifacts/cakecity-backend-2026-10-07.zip`; checksum manifest: `artifacts/cakecity-backend-2026-10-07.json`. Never ship server secrets in the APK.

Implemented source:
- Contextual product pairing, staff-curated product IDs, partial-source recovery, and retry UI.
- Club points ledger, expiring earning lots, net-spend tiers, redemption reservation, coupon recovery, refund reversal and debt recovery.
- Receipt-key-proven WooCommerce order linking and signed order-update webhook processing. Email alone never links an order.
- Birthday benefits, qualified referrals with refund reversal, and audited staff adjustments.
- Account-scoped cloud coupon wallet; eligibility remains a checkout decision.
- Celebration calendar with optional device reminders, plus separate buyer and gift-recipient contact fields.
- Requests for custom cakes, corporate/events and order support; staff replies and expiring quotes with revision-checked customer acceptance.
- Buy-again discovery from saved order items, requiring customers to select current live options.
- Reused upstream HTTP connections, bounded cache, coalesced reads, precompressed responses, optional Redis shared cache/rate limiting, request IDs and route-level latency logging.

Still outstanding:
- Deployment, real PostgreSQL concurrency validation, live WooCommerce credentials/webhooks, native-device acceptance and verification of the fresh EAS build.
- Guaranteed delivery/pickup capacity and slots. The website checkout must enforce these atomically; adding an unvalidated mobile date picker is insufficient.
- Quote-to-order conversion, invoices, deposits and custom-design image upload. Accepted quotes currently require staff-arranged payment/fulfilment and do not create paid orders.
- Remote push campaigns, verified reviews, order-derived recommendation ranking and a connected analytics adapter.
- Production 30-minute sustained and 5-minute burst tests with representative account, checkout and callback traffic.

## Club commercial defaults

- Earn one point for each KES 100 of paid product-line spend after discounts, excluding shipping and tax.
- One point is worth KES 1. Earning lots expire after 365 days; oldest expiry is consumed first.
- Silver begins at zero; Gold at KES 20,000 net qualifying spend; Diamond at KES 50,000; Platinum at KES 100,000.
- Redeem 100-500 points for a single-use, email-restricted, non-stackable WooCommerce fixed-cart coupon. Minimum basket is ten times the coupon value; coupon expires after 90 days. The app initially offers 100-point redemption.
- Issuing failures retain a pending reservation with the same retry key. Points are not deducted twice. Coupons are revealed only after provider confirmation.
- Refunds/cancellations reverse earned points. Already-spent points create a debt recovered from later earnings. Expired, unspent points do not create spending debt.
- Unallocated manual refunds require staff reconciliation and pause redemption.
- Birthday awards are 50/75/100/150 points by tier, once per calendar year on the saved birthday (Nairobi date), after 30 days of membership and KES 2,000 qualifying spend. February 29 birthdays qualify on February 28 in non-leap years. Birthday correction currently goes through support.
- Referrers receive 50 points when the referred member's first verified purchase of at least KES 2,000 reaches completed status. A code must be applied before the first verified order; self/circular referrals are rejected. Maximum ten qualified rewards per year. Any refund on the qualifying order reverses the referral reward.
- QR membership verification and a monetary wallet are not included.

## Deployment

1. Back up PostgreSQL and provision a staging service first.
2. Install `backend/requirements.txt`. Configure `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` and `ENVIRONMENT=production` on the server. Never put server credentials in `EXPO_PUBLIC_*` variables.
3. Set Start Command to `python -m app.start`. It runs schema migration before Uvicorn and works on Render free services, which do not support a separate pre-deploy command. It adds missing tables and refuses incompatible existing columns; it does not drop existing data. Do not point tests at production.
4. Configure `WOOCOMMERCE_CONSUMER_KEY` and `WOOCOMMERCE_CONSUMER_SECRET` with order-read and coupon-write permissions. Keep the API URL HTTPS.
5. Configure `WOOCOMMERCE_WEBHOOK_SECRET` and a WooCommerce order-updated webhook delivering to `/v1/integrations/woocommerce/order-updated`. Verify a real paid order, duplicate webhook and refund end to end. Unknown/unlinked orders are not credited.
6. Optional trusted integration events use `CLUB_EVENT_SECRET`: raw JSON body signed as hex HMAC-SHA256 in `X-Club-Signature`. Payload: `event_id`, `order_id`, `customer_id`, `paid_minor`, cumulative `refunded_minor`, and `currency=KES`. This is server-to-server only; never embed this secret in the app.
7. Provision Redis and configure `REDIS_URL` before testing multiple instances. Without it, caching is per process and distributed rate limiting is inactive. Rate limiting must also be tested with Render's trusted proxy configuration and real customer traffic.
8. Render blueprint defaults to one API worker; `WEB_CONCURRENCY` can override it. Each worker defaults to five pooled database connections plus five overflow connections; budget aggregate connections across workers, instances, deploy overlap and background jobs.
9. Provision existing authorised staff roles through the server's controlled administration process. Customer registration cannot request a staff role. Staff endpoints are available in the API documentation with bearer authentication.
10. Deploy backend, verify contracts, then create the new Android EAS preview under `marcos_noel23/cakecitymobiledev` and perform device QA before release.

## Staff operations

- `GET /v1/admin/enquiries`: review recent requests.
- `PATCH /v1/admin/enquiries/{id}`: respond, quote, decline or resolve using the current revision. Quote amount is integer KES minor units and requires a future timezone-aware expiry.
- `PUT /v1/admin/catalogue/pairings/{product_id}`: configure an ordered list of up to 20 complementary product IDs. Stock and purchasability still filter the resulting live records.
- `POST /v1/admin/club/{customer_id}/adjust`: positive/negative point correction with a reason and stable request key. Negative adjustments cannot exceed available points. Actor identity is stored in the ledger.
- Unallocated refunds must be reconciled with an authoritative signed order event before redemption resumes.

## Validation evidence

Backend tests use an isolated temporary SQLite database. They cover auth, idempotent awards, partial/full refunds, expiry, debt recovery, coupon-provider failures, receipt ownership, account isolation, quote revision checks, birthdays, referrals and cache request coalescing. SQLite success does not prove PostgreSQL locking behaviour.

Load reports in `artifacts/catalogue-load-*.json` are local public-read benchmarks using real catalogue records; no orders or payments were generated. The latest 5,000-request run took 60.55 seconds with zero failures (about 4,955 requests/minute). p95 was 860.16 ms, above the 300 ms target: the performance gate FAILED. Earlier failed baselines are retained. This is not proof of production capacity.

The staging k6 scenario is `backend/tests/load_catalogue.k6.js`. Run with an explicitly supplied `BASE_URL`; default target is 5,000 requests/minute for 30 minutes. Then run 10,000/minute for five minutes and add authenticated/write/callback scenarios before claiming the roadmap capacity target.

Native notification delivery, OS permissions, account switching, deep links and real payment handoff require installed-device review. A web export or source check does not replace that review.
