# Account details and simulation safety — 11 November 2026

This increment follows the supplied master brief's account-management and safe-testing priorities. It retains the existing Expo/FastAPI architecture and the previous tracking/Shop changes. It does not implement the entire corporate/CRM/AI programme.

## Delivered

Account → Profile settings now lets the signed-in customer save first name, last name and an optional Kenyan contact phone. Names and phone are validated on both client and server. Empty phone values become null. Save failures retain the draft, and Discard restores the saved details. The server-confirmed profile updates the in-memory session without rotating credentials or signing the customer out. A delayed save cannot replace another member's identity, and an older concurrent refresh cannot overwrite the confirmed update.

Email, password, account ID and role cannot be changed through this form or API. Existing order snapshots and saved addresses remain unchanged. Contact-phone editing is not phone verification. Profile updates record changed field names in the audit log without copying personal values into it.

`GET /v1/account/profile` reads the current authenticated account. `PUT /v1/account/profile` accepts exactly `first_name`, `last_name` and `phone`; unknown fields are rejected. Both successful responses use `Cache-Control: private, no-store`. There is no target-customer parameter. Current access-token and refresh-session rules remain unchanged.

The legacy staff purchase simulation now rejects every environment except `development` and `test`, including production and staging. This guard applies to fixture-product provisioning, simulated quotes and simulated completion, including test orders created before the environment changed. No production payment, points or sales record is changed by a rejected attempt. Test roles remain required in permitted environments.

Use `npm run preview:local` for the isolated full-app review environment. The separate sandbox service retains its stricter database-isolation rules. Do not enable development mode on a hosted business database to bypass the guard. Existing simulated records are not automatically deleted or reversed by this change; inspect and reconcile them separately if any were created on a business database before the guard existed.

## Deployment and rollback

No schema change or new dependency is required. Deploy backend support before exposing the profile form; an older backend returns an error and the draft remains editable. Rolling back the profile code restores the read-only account fields without deleting saved contact details. Retain the production simulation guard during any rollback; removing it reopens the unsafe simulation path.

## Verification

Final results: 191 frontend tests, 37 focused backend tests, TypeScript and scoped formatting passed. The local browser form flow passed at 13:40 UTC with no browser errors at 320/390/430 pixels. It saved and re-read the normalized contact details, checked invalid input and Discard, then restored the local review account. No real customer record was used.

Focused checks cover durable profile saves, authentication and ownership, rejected identity/role changes, validation, refresh/login persistence, phone removal and audit minimization. Frontend tests cover validation plus account-switch, failure and refresh races. Browser verification exercises the actual form, API persistence and responsive layouts using only the isolated preview account.

Production/native acceptance remains separate. Account deletion/export, verified email/phone changes, Google/Apple identity, privileged MFA, real push delivery, background tracking, fiscal invoicing and provider activation remain open. Concierge stays hidden and disabled.
