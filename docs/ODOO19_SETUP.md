# Optional Odoo 19 integration — cake-demo

Current mode: **independent app**. `ODOO_ENABLED=false` and
`ODOO_LOYALTY_AUTHORITY=false` are the defaults. No Odoo credentials are configured
by this delivery and the connector is not running against your instance.

Target provided by the owner: origin `https://my.cakecity.co.ke`, database
`cake-demo`. `/odoo` is the web-client path, not the API origin. Public HTTPS
reachability was checked; authentication, server version and database contents
were not independently verified.

## What is ready, and what needs mapping

| Area | Implemented integration behavior |
| --- | --- |
| Products | Versioned template/variant import, KES pricelist values, images copied into app media, explicit availability and stable identities |
| Customers/addresses | App changes exported to linked Odoo contacts/delivery addresses; no passwords or app roles exported |
| App orders | Verified live app orders exported to native `sale.order`; original APP reference and provider evidence retained |
| Kitchen | App assignments/status events exported; Odoo kitchen tasks can update assigned app workers and readiness in sequence |
| Riders | Odoo rider contacts explicitly linked to provisioned app rider accounts; no automatic privilege grants |
| Dispatch tasks | Odoo addon tasks can reach the assigned rider; rider updates return through a durable app outbox |
| Loyalty | Optional switch to native Odoo card balance/history and idempotent app reward conversion; app earning stops when Odoo is the authority |
| Ancillary modules | Schema discovery and stored resource snapshots for inventory, branches, manufacturing/BoMs, invoices, payments, purchasing, pricelists, categories, campaigns and loyalty configuration |

Ancillary snapshots are integration records, not complete customer-facing modules
or automatic stock, accounting, payroll, purchase or invoice workflows. Custom
helpdesk/rider/loyalty models need mapping to the addon contract. Odoo's standard
ACLs apply. There is no unrestricted public model/method proxy.

## 1. Install the addon on the test Odoo server

This requires the Odoo server administrator or Odoo.sh project access. A normal
web login alone cannot install a Python addon onto a self-hosted server.

1. Back up `cake-demo` and its filestore using your existing Odoo backup procedure.
2. Extract `cakecity_mobile` from the delivery archive into a custom addons folder
   already included in the server's `addons_path`. Do not copy the app's backend
   Python files into Odoo.
3. Restart the Odoo 19 service using your server's existing service/container
   procedure. The service name and install path are environment-specific.
4. Open the test database, enable developer mode, open Apps, update the Apps list,
   remove the default Apps filter if needed, search **Cake City Mobile Integration**
   and install it. Dependencies include Sales/Stock, Loyalty, CRM, Manufacturing
   and Purchase. Review this dependency scope with your implementer first.
5. On Odoo.sh, commit the addon to a staging branch's addons folder and install it
   in the staging database. Standard Odoo Online does not accept custom Python
   addons; use Odoo.sh/self-hosted infrastructure for this package.

For an administrator using the existing Odoo launcher/configuration, the equivalent
install/test commands have this shape (adapt paths to your actual server):

```sh
odoo-bin -c /path/to/odoo.conf -d cake-demo -i cakecity_mobile --stop-after-init
odoo-bin -c /path/to/odoo.conf -d cake-demo -u cakecity_mobile --test-enable --test-tags /cakecity_mobile --stop-after-init
```

The addon includes native Odoo TransactionCase tests. They were not executed in
this workspace because Odoo/PostgreSQL is not installed here. Run them on staging
before activation; syntax/XML/ZIP checks alone are not installation proof.

## 2. Create an integration user and API key

1. In the test database, create a dedicated **internal** user such as
   `Cake City App Connector`. Do not use a rider account or the system superuser.
2. Assign **Cake City Mobile Integration** and only the needed native module
   rights: contact access, applicable Sales/Loyalty rights and read permissions
   for the additional resources you choose to sync. Do not grant Settings admin
   or Accounting posting access just to make a connection test pass. A missing
   model or permission should be resolved per module.
3. Restrict allowed companies and choose the intended company. Obtain that
   company's numeric ID in developer mode; do not assume it is 1.
4. Sign in as that user. Open **Preferences → Account Security → New API Key**.
   Name it `Cake City app — cake-demo`, choose a suitable expiry, generate it and
   save the displayed key privately. It is shown only once. Follow the instance's
   rotation/expiry policy.
5. Copy `backend/.env.odoo.example` to **backend/.env.odoo.local**. It is ignored
   by Git. Set the key and company ID there. Keep it out of chat, screenshots,
   `EXPO_PUBLIC_*`, the APK and delivery ZIP.

Odoo 19's [official JSON-2 documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
defines bearer-key authentication, the database header, standard ACL behavior and
API-key generation. Hosted plan/API availability must be confirmed by the Odoo
administrator; this package does not change your subscription.

## 3. Configure the company and test the private connection

In the company form's **Cake City app** tab, configure the approved KES pricelist,
delivery service product, and selected loyalty program/rules if needed. Leave
automatic order confirmation and reward conversion disabled during initial UAT.
Enabling the connector on a company does not publish all its products.

In the private backend file:

```dotenv
ODOO_ENABLED=true
ODOO_URL=https://my.cakecity.co.ke
ODOO_DATABASE=cake-demo
ODOO_COMPANY_ID=<actual company ID>
ODOO_API_KEY=<private integration-user key>
ODOO_SOURCE_ID=cakecity-demo
ODOO_LOYALTY_AUTHORITY=false
ODOO_REQUIRE_MAPPED_PRODUCTS=true
```

Use these settings only in a **separate test app backend/database** for integration
UAT. Leave the independent production app's Odoo settings disabled. The ordinary
`preview:local` runner deliberately clears ERP credentials; it cannot connect to
Odoo. The source ID separates test identities from a future production database.

Run from `backend` in its Python environment:

```sh
python -m app.migrate
python -m app.odoo_admin connection
python -m app.odoo_admin check
python -m app.odoo_admin schema --resource products
python -m app.odoo_admin schema --resource loyalty
```

These commands read authentication/context, addon capabilities and field schemas.
The bridge must report `cakecity-odoo-v1`. No order/payment is initiated.

## 4. Publish and synchronize a small test set

1. Mark selected Odoo products **Publish to Cake City app**, with confirmed prices.
2. In contacts, mark applicable contacts as app riders and supply a phone number.
   Publish existing records explicitly:

```sh
python -m app.odoo_admin publish --resource products --limit 25
python -m app.odoo_admin publish --resource riders
python -m app.odoo_worker --direction pull
```

Repeat product pages using `--after <next_id>` until none are published. Product
template/variant updates publish incrementally. The optional scheduled action
**Cake City app: reconcile Odoo resources** starts disabled. Configure its user,
company and permissions, then enable it after UAT. It catches pricelist/ancillary
changes through bounded snapshots; unsupported custom modules must supply adapters.

The app worker uses the same durable app database:

```sh
python -m app.odoo_worker --loop
```

It polls every 30 seconds, drains outgoing events and consumes the versioned feed.
Run it as a separate managed process. Sleeping/free hosting does not guarantee a
continuous worker. The admin APIs also expose status, connection/schema checks,
bounded pull/push operations and versioned stored records under `/v1/admin/odoo`.

## 5. Link riders and kitchen workers

Provision an app account/role using [LOGISTICS.md](LOGISTICS.md). The rider's Odoo
contact **App customer ID** must identify that same app user for outgoing updates.
After the rider feed has imported, an app administrator explicitly links it:

```http
PUT /v1/admin/odoo/riders/{odoo_partner_id}/account
Authorization: Bearer <app administrator session>
Content-Type: application/json

{"customer_id":"<provisioned app rider UUID>"}
```

Odoo **Cake City logistics** creates individual order-linked tasks. They need the
original APP reference, valid production location, linked rider and purchased
item quantities. The corresponding Odoo sale order's App kitchen worker ID and
production plant code map to existing authorized app records. Create/accept an
assignment before collection; new trips cannot skip straight to delivered.

Incoming `logistics_tasks` and `kitchen_tasks` use the same app readiness,
payment, quantity, revision and ownership controls as local work. A signed
optional event endpoint also exists at `/v1/integrations/odoo/events`: HMAC-SHA256
of `timestamp + '.' + raw_body`, with headers `X-Odoo-Timestamp` and
`X-Odoo-Signature`, maximum clock skew five minutes. Configure its separate
32+ character secret only if implementing a webhook sender. The supplied addon
uses the pull feed; no outbound webhook sender is claimed.

## 6. Loyalty and sales cutover are separate decisions

Keep app Club authoritative until existing members, cards, points, tiers and
redemptions are reconciled. `ODOO_LOYALTY_AUTHORITY=true` switches Club overview,
history and redemption to Odoo and stops local paid-order point awards. There is
no fallback to a competing local balance when Odoo is unavailable. Local birthday
grants/adjustments do not override Odoo; custom birthday/referral earning needs
the agreed Odoo rules. No automatic loyalty earning rules are invented by this addon.

App reward conversion deducts native card points transactionally and reuses the
same request key after a timeout. It issues a member-bound single-use app coupon.
This is an explicit Odoo-authorized app reward, not a generic native coupon
validity guarantee across every channel. Native card balances must match the
app's integer-points contract; fractional policies need a reviewed mapping.

Full Odoo commerce mode blocks unmapped product checkout by default and blocks
stale Odoo product quotes. Imported orders retain original amounts; mismatched
Odoo tax totals require reconciliation. Automatic sale confirmation is opt-in.
Provider verification fields do not post an accounting payment, invoice, refund,
eTIMS document or stock validation. Those follow your customized Odoo workflows.

## Acceptance and limits

Verify all of the following in `cake-demo`: native addon installation/tests;
company isolation; product variants/pricelists/images; approved customer/card
linking; duplicate/timeout replay; app order totals and tax; kitchen assignment;
rider mapping and assigned-only access; readiness before collection; split-trip
completion; reversal/reconciliation and worker restarts.

The addon API is extensible to installed Odoo models, but **all customized APIs
are not automatically mapped or verified**. Invoices, stock, manufacturing,
support, branch requisitions and rider payroll require their business-specific
adapters/workflows. Do not represent stored snapshots as completed operational
integration. No authenticated write or addon installation on `cake-demo` was
performed during this implementation.
