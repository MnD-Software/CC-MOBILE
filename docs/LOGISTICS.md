# Independent kitchen, dispatch and rider workflow

The app operates from its own database. Odoo is disabled by default and is not
required for authentication, payments, Kitchen, Dispatch, rider assignments or
customer order tracking. The optional Odoo 19 connector can import/export these
records later; see [ODOO19_SETUP.md](ODOO19_SETUP.md).

## Daily operation

1. A verified paid app order enters **Kitchen**. Unverified, failed or reversed
   payments cannot enter the workflow.
2. An authorized kitchen worker selects the production location and assigns the
   work to themselves. The assignment API also lets a manager assign another
   authorized worker. Start preparing, then mark ready for collection.
3. **Dispatch** selects the rider/driver and allocates the remaining order items.
   Rider planning may happen before readiness; collection cannot.
4. The rider opens **Rider sign in**, then **Your deliveries**, accepts the trip,
   confirms collection, starts delivery and records recipient confirmation.
5. The customer's original APP order shows kitchen progress, rider contact and
   individual delivery statuses. A multi-stop order completes only after all its
   purchased quantities have been delivered. No second order/payment is created.

App routes: `/kitchen`, `/dispatch`, `/rider-login`, `/rider`. Authorized team
members also find their workspaces in Account. Customer signup never grants a
team role. Rider sessions use the existing rotating app authentication and server
role checks; riders receive only their assigned tasks and required contact data.

The screens refresh every 15 seconds while open. This is foreground polling, not
background push, GPS tracking or a guaranteed delivery alert service. Directions
open the device's maps/browser. Proof is a recorded recipient confirmation,
not an uploaded signature/photo, OTP or independently verified delivery proof.

## Provision accounts

Register each person using the app, then run from the **backend environment**
connected to the intended app database:

```sh
python -m app.migrate
python -m app.manage_staff --email rider@example.com --role rider
python -m app.manage_staff --email driver@example.com --role driver
python -m app.manage_staff --email chef@example.com --role production
python -m app.manage_staff --email headchef@example.com --role head_chef
python -m app.manage_staff --email dispatch@example.com --role dispatch
```

These example email addresses must be replaced with the actual existing app
accounts. Passwords remain private. Sign out and back in after changing a role.

Admin/staff/ecommerce managers can operate all locations. Production, head-chef
and dispatch roles default to HQ. `branch_dispatch` and `branch_manager` require
an explicit `branch:<code>` scope. An administrator grants it with:

```http
POST /v1/admin/logistics/scopes/{app_customer_id}
Authorization: Bearer <administrator app session>
Content-Type: application/json

{"plant":"branch:westlands"}
```

Branch users cannot allocate HQ-produced orders. Existing kitchen assignment
ownership, origin changes and dispatch task quantities are checked server-side.

## API contract

All endpoints use app bearer authentication and current database roles. No Odoo
API key belongs in a phone or browser. The running backend's `/docs` and
`/openapi.json` expose the exact typed request schemas.

| API | Role and behavior |
| --- | --- |
| `GET /v1/kitchen/orders` | Kitchen; active paid orders, item/selection details and unassigned flags; excludes billing/payment diagnostics |
| `GET /v1/kitchen/locations` | Kitchen; authorized production locations |
| `PUT /v1/kitchen/orders/{reference}/assignment` | Kitchen; `plant`, `assigned_to` app user ID; managers may assign others |
| `PATCH /v1/kitchen/orders/{reference}/status` | Assigned worker/manager; `preparing` then `ready` |
| `GET /v1/logistics/orders` | Dispatch; location-scoped active orders |
| `GET /v1/logistics/riders` | Dispatch; provisioned rider/driver IDs and names |
| `POST /v1/logistics/orders/{reference}/tasks` | Dispatch; assign a rider and paid quantities to a destination |
| `GET /v1/logistics/tasks` | Dispatch; task history including failed work |
| `PATCH /v1/logistics/tasks/{id}` | Dispatch; permitted trip changes, including reasoned reschedule/cancellation |
| `GET /v1/rider/tasks` | Rider/driver; own tasks only |
| `PATCH /v1/rider/tasks/{id}` | Assigned rider; revision, status, note and delivery confirmation |
| `GET /v1/app-orders/{reference}` | Owning customer; original order, kitchen timeline and delivery statuses |

Task creation requires `rider_id`; optional fields include `items` (each
`sku_id` and `quantity`), `destination`, `recipient`, `phone`, timezone-aware
`scheduled_at`, `slot`, `pv_reference`, `service_type`, `resource_type` and
`external_reason`. Defaults allocate only the remaining purchased items and use
the order's saved destination/contact. An override permits multiple destinations
under the same paid order; scheduling permits separately planned dates. Quantities
cannot exceed the paid order, and future-scheduled trips cannot be collected early.
Cancelled work releases its allocation for a replacement task.

Trip states: `assigned → accepted → collected → in_transit → delivered`.
Failures require a reason; Dispatch can reschedule or cancel an eligible failed
task. Updates require the last-read `revision`; stale changes return HTTP 409.
Delivery requires a confirmation in `proof`. The old admin order-status endpoint
cannot bypass individual trips once they exist. Branch-transfer completion does
not claim customer delivery; final collection remains a staff action.

## Document reconciliation and remaining work

The supplied `Logistics Documentation.docx` was used as reference, not as a command
to activate all proposals. Implemented controls include production-origin scope,
kitchen readiness, rider assignment/ownership, order linkage, split quantities,
scheduled tasks, exceptions and audit records. Its credentials appendix was
excluded from source notes, code and delivery archives.

The following are **not implemented or activated** by this increment: automatic
slot booking/capacity guarantees, the conflicting A–E/A–D/three-slot proposals,
90-minute push alerts, five-minute snooze/escalation delivery, new tariffs/rider
payroll, route optimization, multi-order vehicle manifests, unlinked errands or
stock requisitions, per-trip physical stock-release accounting, WhatsApp/SMS and
24-hour feedback campaigns. Existing checkout pricing remains unchanged. These
need approved business rules and, where applicable, provider/Odoo modules.

Multiple deliveries here allocate already purchased made-to-order quantities;
this is not the document's complete split-date inventory-accounting solution.
The dispatch UI creates a default remaining-items task; advanced split stops,
scheduling, rescheduling and branch transfer are available through the typed API.

## Local review

Run `npm run preview:local`. It uses a separate local database, excludes Odoo and
merchant settings, and supplies local admin/production/dispatch/rider accounts in
the ignored `artifacts/local-preview/LOGIN.txt`. No credentials are committed.

```sh
node scripts/verify-local-preview.cjs --logistics
```

The review creates one explicitly labelled KES 1 simulation and exercises real
Kitchen, Dispatch and rider browser controls. No money is charged or physical
delivery required. Current backend deployment and installed native builds must
be updated before these new routes appear on a real phone.
