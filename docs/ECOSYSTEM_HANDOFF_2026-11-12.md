# Cake City operations ecosystem - implementation and continuation log

Updated: 12 November 2026, Africa/Nairobi. Owner request: independent Cake City administration and department dashboards on web and mobile, premium UI, shared statistics, and staff login that never lands in the customer product catalogue. Odoo work is paused. This file is written before implementation and must be updated as work is verified.

## Read this first when continuing

1. Read this file, `AGENTS.md`, `docs/APP_DASHBOARD.md`, and the latest git diff/status. Do not overwrite work in progress.
2. Read https://docs.expo.dev/versions/v57.0.0/ before changing Expo code, as required by the repository. Check the installed versions rather than assuming the docs reference is the installed SDK.
3. Preserve customer Shop layout, checkout, Pesapal reconciliation, order receipt confirmation, Club and tracking. Never initiate a real charge to test changes. Keep simulation revenue separate from verified real sales.
4. No Odoo activation, credential changes, bulk staff creation, destructive migrations or changes to live records are authorized by this UI task. Staff management must enforce server-side permissions; customer registration must never grant a staff role.
5. Do not print or commit secrets. Private review settings/artifacts are ignored. Preserve unrelated untracked APK and WooCommerce integration directories.
6. Keep this document's checkpoints, exact test commands/results, outstanding limitations and next actions current. A pushed commit is not proof that Render deployed it or that native phone behavior was checked.

## Approach and architecture

Extend the existing FastAPI application, staff dashboard and Expo client. Use one authoritative operational API and database for mobile/web statistics and actions. Keep the web dashboard in the existing Render deployment instead of creating a disconnected demonstration site or a second data store. Reuse the current kitchen, dispatch and rider state machines and payment audit trail.

Authentication determines the workspace on both fresh login and restored sessions. Staff get their own home, navigation, department statistics and tasks. Customer browsing remains available to customers/guests; staff tools do not render catalogue screens as their default workspace. UI hiding is not authorization: every department API must validate its role on the server.

The initial role matrix will be reconciled with actual backend role names during the audit:

| Workspace | Relevant data and actions | Restricted information |
| --- | --- | --- |
| Admin / ecommerce management | Verified sales, period comparison, sales trend, popular products, order funnel, payment exceptions, fulfilment workload, staff and audit access where already supported | No client-side payment credentials or fabricated profitability |
| Kitchen / production | Paid production queue, quantities, cake size and instructions, readiness, ageing, ready handover | Company sales reports, rider private data unrelated to handover |
| Dispatch | Ready orders, assignment, available riders, delivery state, exceptions, handover and completion | Company-wide revenue and customer data unrelated to deliveries |
| Rider | Own assignments, collection/delivery tasks, own workload and delivery outcomes, location sharing controls | Other riders' customers or global sales |
| Branch / customer service | Relevant collection/order operations allowed by existing roles | Administrative finance and staff controls unless separately granted |

Sales metrics must state their source and definition: verified paid app purchases in the selected Kenyan calendar period, excluding simulated purchases and failed/cancelled/reversed payments. Do not imply WooCommerce or Odoo revenue is included unless actual queries prove it. Inventory/product administration can exist in an authorized admin module, but the public shopping catalogue is not a staff landing page.

Design: a calm operational console, Cake City plum/pink branding, clear typography, spacious KPI cards, meaningful trend/funnel visuals, green completed work, restrained motion, desktop sidebar and responsive mobile navigation. Use real loading/empty/error states, labelled controls, minimum touch targets, keyboard access, and narrow/large viewport checks. Avoid fake graphs, invented statistics, decorative clutter and inaccessible color-only status.

## Scope and additional operational essentials

- Role-aware login, restored-session routing, direct-link access checks and sign-out.
- Shared department KPI API, date ranges in Kenyan time, explicit live/test data boundaries, currency units and freshness.
- Admin sales dashboard with comparison, trend, order states, fulfilment pressure and exception visibility.
- Department task workspaces connected to existing audited mutations, with visible success/error feedback and disabled duplicate submissions.
- Responsive web admin/dispatch/kitchen/rider navigation and equivalent mobile overview statistics.
- Keep staff account provisioning private and controlled. Document existing creation/reset process; do not distribute shared production credentials.
- Preserve notifications, dispatch assignment validation, customer tracking and receipt counters. State missing SMTP/push/maps services honestly; no fake live GPS or ETA.
- Keep auditability, permission failures, pagination/limits, no-store private responses, and test coverage for financial definitions and cross-role data access.

## Repository map confirmed before implementation

- Existing web console: `backend/app/dashboard/index.html`, `dashboard.js`, `dashboard.css`.
- Existing API: `backend/app/routes_dashboard.py`, `routes_app_admin.py`, `routes_logistics.py`.
- Staff provisioning: `backend/app/manage_staff.py`.
- Mobile authentication: `src/auth/AuthProvider.tsx`, `src/features/auth/AuthScreen.tsx`.
- Mobile operations: `src/features/logistics/OperationsScreen.tsx`, `RiderScreen.tsx`, `app/kitchen.tsx`, `app/dispatch.tsx`.
- Customer shell: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`; staff routing needs an explicit boundary around this shell's customer UI.
- Existing app commerce and order events remain authoritative for app-owned purchases. Older memory about WooCommerce ownership may be outdated; verify current code before changing commerce.

## Checkpoints

- [x] Create this approach and handoff document before implementation.
- [x] Audit actual role names, auth redirects, existing dashboard APIs and department mutations.
- [x] Implement and verify shared role-scoped operational metrics.
- [x] Implement department-first mobile login/restoration and staff overview.
- [x] Upgrade the existing web workspace with the same data and responsive UI; visual device/browser acceptance remains pending.
- [x] Verify permissions, sales calculations, department actions and customer regression tests with automated checks.
- [x] Record exact checks, remaining acceptance items, commit and remote push evidence.

## Current state and next action

Implementation is complete locally, with deployment and visual acceptance still distinct from automated verification. New files:

- `backend/app/staff_workspace.py`: `/v1/staff/overview` and admin-only `/v1/staff/team`. Overview is private/no-store, accepts `from_date`, `to_date` (up to 93 inclusive days) and `mode=live|simulation`. All provisionable roles have a department and server-declared modules.
- `backend/app/dashboard/workspace.js`: shared-metric overview, date presets/custom period, live/simulation view, sales trend with accessible daily table and CSV export, ranked products, workload, exceptions, role-specific tools, enquiries/replies/quotes, rider tasks, team and audit views. Uses existing authenticated request/refresh logic and server-side state transitions.
- `src/auth/staff-routing.ts`, `StaffRouteBoundary.tsx`, `app/workspace.tsx`: staff landing and restored-session boundary, separate department routes and hidden customer dock. The customer tabs avoid rendering for a restoring/staff session. Root navigator remains mounted to avoid navigation-before-mount errors. Unknown non-customer roles fail closed at the API.
- `src/features/staff/`: native overview, shared validated metric contract, team/audit/enquiry views, and department KPI strip. Admin tools with a dedicated existing native screen use it; web-only editors explicitly open the authenticated web console.
- Existing web assets receive a plum sidebar, spaced data cards, responsive trend/attention/tool sections, reduced-motion treatment and keyboard focus styles. No new UI dependency or separate hosting build is introduced.
- `routes_app_admin.py`: older order-reading endpoints now filter kitchen/dispatch/branch actors by permitted production location and omit financial/billing snapshots for these roles. Legacy fulfilment updates also enforce location scope and return a departmental projection. Admin/customer service retain their required order-desk access.

The existing `app/command-center.tsx` remains in source as a legacy request/content-history tool; it is not the staff landing. Its old availability disclaimer is superseded by this overview. Do not replace or delete its revision restoration implementation casually. Customer profile and public shopping design remain unchanged.

Next operational actions: deploy the backend commit to Render, restart the local tunnel review for new backend routes, sign out/back in with a deliberately provisioned staff account, and perform the acceptance matrix below. Odoo and AI remain paused.

## Validation and deployment evidence

Implementation commit: `bb88d4c86cc4488689dbf35007cfc28f36df39b2`, pushed to `origin/master` at `https://github.com/MnD-Software/CC-MOBILE.git`. `git ls-remote origin refs/heads/master` confirmed that exact implementation SHA before this documentation-only follow-up. The later documentation commit can be identified with `git log`; it does not change the implementation. No Render deployment was verified. Unrelated untracked APK/WooCommerce directories were preserved.

Verified automated checks:

- `npm test`: **211 passed**, including new staff route and web rendering/data escaping tests. The first broad run caught two import-format assertions; both were fixed and the full suite reran successfully.
- `npm run typecheck`: passed after correcting the error-color theme token.
- From `backend`: `..\.venv\Scripts\python.exe -m pytest tests/test_staff_workspace.py tests/test_dashboard.py tests/test_logistics.py tests/test_full_purchase_cycle.py -q`: **50 passed**, one existing Starlette/AnyIO deprecation warning. Covers all provisionable roles, customer denial, finance isolation, Kenyan date boundaries, ledger reversals/comparison, simulation and website exclusion, branch scope, rider ownership, static asset access and kitchen/dispatch lifecycle.
- After the final legacy fulfilment-response privacy change, reran `tests/test_dashboard.py::test_dashboard_static_shell_and_no_arbitrary_files tests/test_full_purchase_cycle.py tests/test_staff_workspace.py`: **31 passed**, with the same deprecation warning. After the overview's account/session race guard, the two dashboard renderer tests passed again.
- Dashboard JavaScript syntax checked with `node --check` for both scripts. Formatting and `git diff --check` are required before staging.
- No live payment was initiated, no production account or role was changed, no Odoo connection was activated, and no live deployment is claimed.
- Browser visual QA unavailable: this session has no Node REPL JavaScript tool for the prescribed browser runtime. Dashboard renderer tests are not screenshots or native phone verification. Do not bypass the previous preview-launch approval rejection from the earlier shopping task.

Sales definitions: app/live/KES ledger rows only. Net is gross verified payment minus recorded reversal, attributed to original payment date; comparison uses the preceding equally sized period. Average uses gross/order count, including purchases subsequently reversed. Product ranking sums recorded item subtotals for non-fully-reversed orders, before order-level discounts/delivery/reversal allocation, and says so. There is no profitability, tax filing, website synchronization or invented ETA claim. Workload is current backlog, not limited to the chart's purchase period. Simulation mode intentionally has no live sales panel.

Pending acceptance (not a reason to call deployment complete):

1. Web at 320, 390, 768 and 1440+ px: no overflow, readable KPIs, keyboard date filters, focus, modal forms, CSV download and role-specific navigation.
2. Mobile small/large Android and iPhone: cold restored staff login shows workspace without products/dock flashing; back/sign-out return correctly. Customer sessions still open Home/Shop.
3. Separate staff accounts: admin sees ledger; production/head chef sees scoped kitchen; dispatch/branch roles see allowed locations; rider/driver sees only owned tasks; marketing/content sees campaigns; finance sees reporting without operational customer data; sales/customer service sees enquiry handling.
4. Complete a mocked/local paid order through assigned production, ready, dispatch allocation, rider acceptance, collection, transit and receipt confirmation. Verify customer notifications/tracking and green completed steps. Use simulation view deliberately to review simulated workload.
5. Confirm Render deployed the exact pushed commit and health/API availability independently. SMTP/push/map service configuration still requires real provider setup where absent.

Staff provisioning (administrator/server shell, existing account only):

```sh
cd backend
python -m app.manage_staff --email EXISTING_STAFF_ACCOUNT_EMAIL --role production
```

Choose the intended role from the command's supported choices; there is no default/shared password. Sign out and back in to refresh mobile navigation. Admins can assign branch scopes through the existing authenticated `/v1/admin/logistics/scopes/{customer_id}` endpoint; no broad default branch grant is introduced.

Deploy on the existing backend service; `/admin` remains the web entry point. Restart `npm run start:go:tunnel` for local review after the backend changes. Mobile statistics and web use the same database only when configured to the same backend. The web console prompts for its own staff sign-in; mobile tokens are not transmitted in URLs.
