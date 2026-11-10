# Kitchen, dispatch, riders and optional Odoo — delivery record

The requested independent app workflow is implemented locally. Odoo integration
is optional and disabled by default. Nothing from this increment has been
deployed, pushed to GitHub, installed on Odoo or published as a native build.

## Delivered

- Dedicated rider sign-in and assigned-only rider workspace; production, kitchen
  manager and dispatch workspaces with server role/location checks.
- Verified payment → kitchen assignment → preparing → ready → rider acceptance
  → collection → in transit → delivered. Customer order history uses the same
  records and shows individual delivery states.
- Multiple stops/dates represented as paid-item allocations on the original
  order; no duplicate customer payment. Completion requires every allocated
  item delivered. Future collection, stale revisions, wrong-rider access,
  branch-to-HQ allocation and unpaid fulfilment are blocked.
- Failed trips retain their reason/history. Dispatch can reschedule/cancel using
  the typed API. Recipient confirmation is required before marking delivered.
- Optional server-only Odoo 19 JSON-2 client, durable inbox/outbox, event replay,
  stable product/rider identities, product snapshots, native order export,
  Odoo-authoritative loyalty mode and kitchen/trip mapping.
- Companion Odoo addon, native Odoo test source, installation/API-key guide and
  a source-only ZIP. The addon has not been installed/tested in an Odoo runtime.

## Validation

| Check | Verified result |
| --- | --- |
| Backend full suite | 212 passed; one upstream Starlette/httpx deprecation warning |
| Subsequent connector/logistics/payment regression run | 35 passed |
| Final logistics regression after scheduling/input guards | 10 passed |
| Frontend suite | 174 passed, no failures/skips |
| TypeScript | Passed after final app changes |
| Formatting | Passed; changed scripts formatted with the repository Prettier |
| Expo web export | Passed |
| Real local browser/API simulation | Customer/admin sign-in, team workspaces and full kitchen–dispatch–rider lifecycle passed; parent order completed, zero runtime exceptions/external writes |
| Odoo source package | Python AST, XML, ACL CSV, manifest references and ZIP integrity checks passed; no API keys or original credentials appendix included |

Evidence lives in `artifacts/odoo-integration-2026-11-10/` and
`artifacts/local-preview/browser-verification.json`. Phone-width screenshots:
`kitchen-ready-390.png`, `dispatch-assigned-390.png`, `rider-delivered-390.png`.
The browser flow creates explicitly labelled simulated KES 1 orders. No money
was charged. Unit tests mock all provider and Odoo requests.

The addon uses the owner's supplied Odoo 19 target (`my.cakecity.co.ke`,
`cake-demo`), but only public reachability was checked. Database identity,
custom module mappings, addon installation and authenticated integration remain
unverified. No API key was supplied or saved by this implementation.

## Open for review

- Customer app: <http://localhost:8082>
- Kitchen: <http://localhost:8082/kitchen>
- Dispatch: <http://localhost:8082/dispatch>
- Rider sign-in: <http://localhost:8082/rider-login>
- Local account details: ignored `artifacts/local-preview/LOGIN.txt`.

Restart with `npm run preview:local` if the processes stop. Accounts, catalogue
and simulation orders persist only in its separate local review database.

Operating guide and API table: [LOGISTICS.md](LOGISTICS.md).
Optional Odoo installation/API-key instructions: [ODOO19_SETUP.md](ODOO19_SETUP.md).
Addon delivery: `downloads/CakeCity-Odoo19-Integration.zip`.

## Practical boundaries

Foreground polling supplies new assignments while the rider screen is open;
background push and live GPS are not implemented. Delivery confirmation is
recorded text, not photographic/signature/OTP proof. Advanced split dispatch,
schedule changes and branch-transfer controls are API capabilities; the current
dispatch screen assigns remaining order items to one selected rider.

The logistics document's conflicting schedules/capacity assumptions, tariffs,
rider payroll, internal requisitions, automatic alerts/escalations, messaging,
feedback and full inventory accounting were not activated. See LOGISTICS.md for
the reconciliation. Its embedded credentials were omitted from the extracted
source notes and deliverables; the source DOCX was not modified.

Ancillary Odoo resource/schema adapters are extension points and snapshots,
not proof of full custom ERP deployment. Native invoices, accounting payments,
stock moves, fiscalization and custom earning rules remain Odoo-specific work.

The earlier production launch gates still apply: approved privacy policy,
confirmed fulfilment/tax rules and actual Android/iPhone payment/device testing.
