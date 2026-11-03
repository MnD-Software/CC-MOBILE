# Cake City app web dashboard

The dashboard is served by the independent FastAPI app backend at `/admin`.
After this code is deployed on the existing Render service, its address is
`https://cc-mobile-1.onrender.com/admin`. This is a deployment target, not proof
that the current Render deployment contains this release.

No separate web hosting, Node build, WordPress login, website availability or
Pesapal credentials in the browser are required. The HTML, CSS and JavaScript
are included under `backend/app/dashboard` and shipped with the Python source.

## Access

Use the same email/password account as the app. A backend operator must assign
the owner account the `admin` role for access to every dashboard section:

```sh
cd backend
python -m app.manage_staff --email OWNER_ACCOUNT_EMAIL --role admin
```

Replace `OWNER_ACCOUNT_EMAIL` with the existing owner's account email. The
account must already exist. Run the command in the Render service shell against
its production database, then sign in again. There is no default administrator,
shared password, public role-grant route or browser-side privilege override.

Roles:

| Role | Dashboard access |
| --- | --- |
| admin, staff, ecommerce_manager | Products, campaign editing, promotions, orders, sales, issues |
| marketing_manager, content_manager | Campaign editing |
| executive, analyst | Campaign viewing and channel reporting |
| finance | Channel reporting |
| customer and other operational roles | No dashboard access |

The server checks the account's current database role on every API request.
Dashboard tokens are retained in memory only; refreshing the page requires sign-in.
The session refreshes while working, and Sign out revokes its refresh token.

## What can be managed

- Products: search the entire imported catalogue by name, slug or ID; filter
  enabled/disabled products and variations; create simple products; edit names,
  descriptions, slugs, categories, images, app prices and allocations. Existing
  variation configurations are preserved. Enable or disable ordering without
  deleting sales history. Allocation cannot fall below reserved plus sold units.
- Images: upload JPG, PNG or WebP up to 2 MB to the app backend. Existing copied
  catalogue images remain on the app media archive. Save the form after uploading.
- Campaigns: create and edit campaign stories, artwork, video URLs, product links,
  category, branch targeting, member targeting, template and local-time schedule.
  Publish or unpublish them. The server stores timezone-aware timestamps; the app
  displays campaigns only within their published schedule. Drafts also require
  artwork and a product/category link. This uses the existing revision history API.
- Promotions: create and edit general cart discount codes with fixed KES value,
  minimum subtotal, expiry, total redemption limit and enabled state. These are
  the actual independent checkout coupons, not advertising-only records. Codes
  apply to the product subtotal, one per order, and do not discount delivery.
  Percentage discounts, automatic markdowns and start-time scheduling are not
  included. Member reward coupons are shown only in the separate member system
  and cannot be overwritten by general promotion editing.
- Orders: view the latest 200 app orders and advance verified paid orders through
  preparing, ready, delivery and completed states. Payment success cannot be set
  manually from the dashboard.
- Sales: view recorded live gross, reversals and net totals by app/website channel.
  Website totals require the optional reporting integration described in PESAPAL.md.
- Issues: view app/website issues separately, resolve or reopen them.

To advertise a discount, create its code under Promotions and include the code
in the campaign description. A campaign does not silently change checkout prices.
Conflicting product/campaign/promotion edits return a reload warning. Product and
promotion configuration writes are recorded in the administrative audit log.

## Deployment and local verification

Deploy this backend release using the existing Render start command. Database
startup/migration and the independent catalogue import remain prerequisites from
[PESAPAL.md](PESAPAL.md). Dashboard storage uses the existing app database tables;
there is no additional schema migration specifically for the dashboard.

For local development, from `backend`:

```sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Open `http://127.0.0.1:8010/admin`. Local database contents and accounts are separate
from production. Run regression checks from `backend` with `python -m pytest tests`.

The page is responsive for desktop and mobile browsers. API writes remain
authenticated even though the sign-in page and its assets are public. The page
uses a same-origin content security policy, disallows framing and renders record
text with escaping. Uploads and saved products are shared with the app immediately;
an already-open app may retain its catalogue cache until refreshed.
