# Independent app payments and commerce

The app now owns its catalogue, made-to-order availability, price validation, delivery rules, orders, payment records, receipts and customer information pages. Runtime checkout does not call WooCommerce, WordPress, or Cake City's website. The previous WordPress bridge is retired and must not be installed for this implementation.

## Customer flow

1. Products, categories, variation prices and copied images are served from the app backend/database.
2. A signed-in customer reviews their bag and contact/delivery details. Render validates the app's prices, enabled products, ordering mode, coupon, delivery area and tax policy. It returns a short-lived server quote; the customer confirms its total.
3. The app persists an idempotency key before creating an app order. The backend atomically validates the product revision and reserves coupon use (physical stock is reserved only for explicitly stocked items) and assigns a distinct reference, for example `APP-20261103-7C91A30081C246AE`.
4. Render submits the order directly to Pesapal. The returned payment page loads inside a native WebView; no browser or Cake City website checkout opens. A web build uses an embedded iframe. Unknown non-HTTPS navigation and Cake City website navigation are blocked in native payment. Bank authentication support still needs real Android/iPhone verification.
5. The return URL only closes the payment view and requests verification. Render independently queries Pesapal and verifies the app reference, merchant profile, amount, currency and tracking ID. A URL parameter cannot mark an order paid.
6. Confirmed payments update the app's order, Club ledger and channel-sales record. Receipts and order support remain in the app. The receipt is a payment receipt, not an eTIMS fiscal invoice.

Order recovery uses the account's backend order history and the persisted original request key. It never recreates a lost payment automatically. A provider timeout leaves an uncertain payment for IPN/verification or staff reconciliation. Pending payments retain reservations until verified; they are not automatically released while money may be in flight. An unstarted order can be cancelled through the app order API. A success received after stock was released is recorded as paid but requires staff review before fulfilment. Reversals preserve traceability and require staff review; no automatic refund claim is made.

## Required Render configuration

Keep the existing database, JWT and Redis settings. They must use infrastructure allocated to the app, independently of the website. Set these only in Render's private Environment settings:

```dotenv
PESAPAL_CONSUMER_KEY=<current key>
PESAPAL_CONSUMER_SECRET=<current secret>
PESAPAL_ACCOUNT_ID=primary
PESAPAL_ENVIRONMENT=live
APP_PUBLIC_URL=https://cc-mobile-1.onrender.com
```

`PESAPAL_PUBLIC_URL` can override the public callback origin. Otherwise Render's `RENDER_EXTERNAL_URL` is used. Notification registration is automatic when a customer starts payment. Merchant keys are never placed in `EXPO_PUBLIC_*`, the app bundle, a receipt or this export.

WooCommerce credentials are not required for app checkout, catalogue, receipts or app reward issuance. An optional website-sales reporting source is a separate integration and is not called by any app customer request.

## Changing Pesapal keys/accounts

For a different merchant account, retain the original credentials for outstanding transactions, assign a new account ID and configure the private `PESAPAL_ACCOUNTS_JSON` setting:

```json
{
  "primary": {"environment":"live","consumer_key":"<old key>","consumer_secret":"<old secret>"},
  "app-v2": {"environment":"live","consumer_key":"<new key>","consumer_secret":"<new secret>"}
}
```

Set `PESAPAL_ACCOUNT_ID=app-v2` for new orders. Existing orders keep `primary`, their original environment and a fingerprint of the consumer key; they continue to verify against the old account. Do not overwrite an existing account ID with a different consumer key. A mismatch deliberately blocks verification rather than silently querying another merchant. If Pesapal revokes an old key, outstanding transactions need account-specific reconciliation. The actual account ownership and settlement destination must be confirmed with Pesapal; this code does not change them.

## Import the exported catalogue, images and pages

The migration archive is `artifacts/Independent-App-Migration.zip`. It contains `catalogue.json`, copied `media/` bytes and this guide. It contains no customer exports, app test credentials, Render environment files or merchant secrets.

From the backend service environment, with the archive extracted into a private deployment folder:

```text
python -m app.migrate
python -m app.import_store import /absolute/path/to/export
```

The import is an explicit operator action, never part of customer requests or server startup. Re-running it adds missing records without overwriting app-managed product prices/stock. Valid priced, source-purchasable products and variations are imported as made to order. They do not require finished stock or an allocation. Checkout still requires confirmed pricing and fulfilment rules. Explicit operator-disabled products stay disabled when reimported. The app serves the copied images from `/v1/app-media/`; it never falls back to loading the original website image.

Export results: 1,677 product/variation records, 368 image URL mappings, and five pages: Terms and Conditions, About Us, Shipping, Locations/Branches and Return/Exchange Policy. The public WordPress pages endpoint returned invalid JSON. Direct source requests recovered those five pages. Privacy Policy, Contact Us and an initial guessed branches URL returned 404; the actual Locations/Branches URL was subsequently found and exported. Customer contact is implemented through in-app Requests & support. The missing privacy text must be supplied/published by Cake City through `PUT /v1/admin/app-pages/privacy-policy`; an invented policy was not inserted. Imported website policies are source copies and require owner review for the independent app before release.

84 image URLs remained unavailable after a second attempt using original-size/origin URLs. `catalogue.json` records every failed source in `media_failures`. Replace those images through app-owned assets before rollout. Missing assets return an app-local 404, not a website request. The archive does not claim a complete media migration.

## Made-to-order, delivery and tax setup

### Automated catalogue copy

The catalogue does not need manual entry or an archive upload. On **Render Free
with Neon**, keep the existing Neon `DATABASE_URL` in Render Environment. Update
the service's **Build Command** (with Root Directory `backend`) to:

```sh
pip install -r requirements.txt && python -m app.setup_store --if-empty
```

Save and deploy the commit containing `app.setup_store`. No paid shell or
pre-deploy command is needed. The Blueprint in `backend/render.yaml` includes
this command; existing manually configured Render services must update their
Build Command in Settings. A nonempty app catalogue causes the copy to be skipped
without contacting the website on subsequent builds. Fresh imports copy data
directly into the configured Neon database; downloads on Render disk are only
temporary staging. This does not create or replace the Neon database.

For an operator with shell access, or local development, the equivalent command
without the skip-existing guard is:

```sh
python -m app.setup_store
```

It downloads the public products, variations, images and available information
pages, then saves them in the app database. Progress is printed throughout.
Wait for the build log to report `Catalogue copy complete` (or the existing-catalogue
skip message). Missing source
images/pages are counted; they do not silently become replacement content.
Temporary downloads are removed after the database import. Re-running without `--if-empty`
preserves app edits, prices, stock allocations and existing pages. An empty source
catalogue aborts the import. No website credentials are required.

This is a deployment/operator task, not a customer or startup dependency. Afterwards the
app reads its own database even when the website is unavailable. The command
does not invent stock, delivery fees or tax settings, grant an admin role, enable checkout or attempt a payment. Valid priced products use made-to-order availability; checkout settings remain separate decisions.

Render Free has no service shell, SSH or paid pre-deploy step, and its web service
can sleep after inactivity. Neon stores the app records and copied image bytes
across Render restarts. This does not remove Render cold-start delays. Source:
[Render Free documentation](https://render.com/docs/free).

An existing extracted export can also be imported in one command with
`python -m app.setup_store --from-directory /absolute/path/to/export`.

Cake City cakes are **made upon order**. Products with `order_mode=made_to_order` do not require a stock quantity, do not reserve or deduct finished goods, and are not sold out merely because allocation is zero. Staff control whether a cake is offered through its enabled setting and confirmed price. Paid quantities remain in the immutable app order snapshot, order events and sales ledger. There is no invented production capacity or promised preparation time. Scheduling and date-specific capacity limits require confirmed business rules before implementation. Explicitly stocked items can still use `order_mode=stocked` and retain the existing stock reservation protections.

Authorized roles can open Account > App commerce & sales. This screen manages app product prices/availability, delivery zones, checkout rules, the app fulfilment queue, channel sales and issue status. Product updates reject stale revisions. Existing physical-stock reservations are preserved; their allocations cannot be reduced below reserved plus sold units. It supports 5,000 catalogue entries (the export contains 1,677).

Before enabling ordering, confirm and save the tax/pickup rules in Account > App commerce & sales. The corresponding operator API is `PUT /v1/admin/app-policy`:

```json
{
  "enabled": true,
  "pricing_confirmed": true,
  "pickup_enabled": true,
  "prices_include_tax": true,
  "tax_bps": 0,
  "pickup_instructions": "<Cake City's confirmed pickup instructions>"
}
```

The values above illustrate the API shape; zero tax is not a tax recommendation or a live configuration. Use Cake City's approved actual tax treatment and pickup location. Configure delivery zones and their actual fees in the operations screen or `PUT /v1/admin/app-delivery-zones/{id}`. The customer must choose a configured zone. Lead-time/cutoff rules, dispatch provider integration and eTIMS remain separate release work; operators must only allocate production capacity they can fulfil.

## Sales accountability and issue separation

Every app order and sale has `channel=app`, its app reference, payment environment, merchant profile and provider tracking ID. App order events record creation, payment changes and staff fulfilment transitions. Sandbox transactions are excluded from live channel totals. Staff fulfilment moves only a verified paid app order through supported preparation/ready/delivery/completion states.

`GET /v1/admin/channel-sales?environment=live` reports gross, reversed and net KES minor units separately for `app` and `website`. No website totals are assumed. `GET /v1/admin/commerce-issues` returns an explicit channel and reference for each issue. Payment ambiguity, amount mismatches, reversals and late payments are recorded against the app channel.

Website sales can be ingested independently at `POST /v1/integrations/website-sales`. Configure a private `SALES_INGEST_SECRET` of at least 32 characters. The sender signs the exact UTF-8 JSON bytes using HMAC-SHA256 and sends the lowercase hex digest as `X-Sales-Signature`:

```json
{"reference":"WEB-12345","environment":"live","paid_minor":250000,"reversed_minor":0,"version":1,"occurred_at":"2026-11-03T09:00:00+03:00"}
```

Only aggregate sale/accounting identifiers enter this endpoint; no payment credentials or customer details are required. Versions reject stale/conflicting updates. Website reporting must not send copied app orders as website sales: `APP-` references are rejected. The sender should queue/retry independently. A separate optional reporting job is included: run `python -m app.sync_website_sales --days 7` in a Render cron job using the app database plus the existing WooCommerce read credentials. It only copies sales totals, not customer data, marks website reporting failures in the website issue channel, and skips app orders/copies. Use a larger lookback for an initial historical import. Neither the cron schedule nor a live website sales import was deployed/executed in this change. Website failure may delay website reporting but cannot block an app purchase.

## Deployment and verification

Backend service root: `backend`; build: `pip install -r requirements.txt`; start: `python -m app.start`. Startup creates additive app tables and preserves old records. Keep the database and Redis provisioned for the app; copy/restore these independently of WordPress backups.

Deploy the updated backend, import the migration archive, configure app products and the checkout policy, then build/install the updated app. `react-native-webview` was added using the installed Expo SDK 58-compatible version. Existing native development/release builds need a new native build for that module. The required Expo v57 documentation was read first and the workspace's existing SDK 58 upgrade was preserved.

Check `/health`, `/ready/db`, `/v1/catalogue/products` and `/v1/payments/pesapal/config`. Configuration availability checks settings/policy presence, not merchant activation or a successful charge. Confirm the app's infrastructure and media are provisioned separately before claiming operational uptime independence.

The owner will perform the live payment. Test both Android and iPhone: confirm the app reference and total, pay inside the embedded Pesapal view, close/reopen the app, verify the same order/receipt, and validate any card 3DS or M-Pesa authorization steps. Do not start a second payment while a previous transaction is pending/uncertain. Provider/bank services and the app's own backend remain necessary dependencies.

Local checks include `npm test`, `npm run typecheck`, backend `python -m pytest tests -q`, migration import validation and Android JS bundle export. These do not certify a native-device payment, the live merchant, settlement, eTIMS, hosted deployment, website reporting synchronization or all store-specific fulfilment policies.

Provider references: [Pesapal order submission](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest), [transaction verification](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus), [Expo WebView](https://docs.expo.dev/versions/v58.0.0/sdk/webview/).
## Catalogue category repair

Source products with `parent: 0` are main products, not variations. The importer
stores that value as SQL `NULL` so category browsing includes them. Startup
migration also repairs the earlier zero-parent records without changing prices,
stock, reservations or orders. Reimporting the full catalogue is unnecessary.

The app's All selection browses the full catalogue, category links retain their
exact category IDs, and the category picker includes the imported category list.
The home carousel contains only Deals & Steals products; it does not substitute
Signature products. A deal can be browsed while ordering is disabled, with its
ordering status shown explicitly. These are app UI changes and require reloading
the development app or installing an updated production app build.

## Web management dashboard

The independent backend includes the staff web dashboard at `/admin` for products,
campaigns, promotion codes, app orders and channel reporting. See
[APP_DASHBOARD.md](APP_DASHBOARD.md) for owner access and deployment instructions.
