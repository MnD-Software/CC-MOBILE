# Backend setup and remaining work

## Configure the implemented service

Deploy this source revision before expecting the new endpoints on the hosted service. A GitHub push alone does not verify that the hosted service has deployed it. The configuration below is for the existing FastAPI service, not a replacement backend.

- Python: 3.12 (the tested dependency set requires at least 3.11).
- Service root: `backend`.
- Build command: `pip install -r requirements.txt`.
- Start command: `python -m app.start` (runs the additive migration before workers start).
- Liveness: `/health`. Verify database readiness separately at `/ready/db`.

Set these in the hosting service's secret/environment settings; never in `EXPO_PUBLIC_*` client variables:

```dotenv
ENVIRONMENT=production
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-DATABASE/cakecity?sslmode=require
JWT_SECRET=PROVISION_A_UNIQUE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
REDIS_URL=YOUR_PROVISIONED_REDIS_CONNECTION_URL
CORS_ORIGINS=https://YOUR-CORPORATE-ORIGIN,https://YOUR-STAFF-ORIGIN
WOOCOMMERCE_STORE_URL=https://cakecity.co.ke/wp-json/wc/store/v1
WOOCOMMERCE_API_URL=https://cakecity.co.ke/wp-json/wc/v3
WOOCOMMERCE_CONSUMER_KEY=PROVISION_SERVER_SIDE
WOOCOMMERCE_CONSUMER_SECRET=PROVISION_SERVER_SIDE
WOOCOMMERCE_WEBHOOK_SECRET=PROVISION_AND_MATCH_THE_WOOCOMMERCE_WEBHOOK
```

Use actual origins without paths, trailing slashes or wildcards. For native-only access, `CORS_ORIGINS` can be empty. Provision a real Redis service, not a localhost URL on the hosted server. Generate JWT material privately, for example `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Changing JWT signing material requires reauthentication.

WooCommerce credentials are required for authenticated server order lookups and existing reward coupon issuance. Assign only the WooCommerce permissions those enabled operations require; coupon creation needs write access. Public catalogue reads do not need a secret. Use a separate staging WooCommerce setup for integration tests. The current website Pesapal checkout is distinct from a new approved native payment integration.

`CLUB_EVENT_SECRET` is only needed if using the custom signed Club event adapter. It is separate from `WOOCOMMERCE_WEBHOOK_SECRET`. Do not enable a second points-awarding integration alongside Enquest until the single-source-of-truth decision and adapter are complete. Local Club code is not an Enquest integration.

Never deploy the local preview account factory or payment simulator as the production entry point. `python -m app.start` starts the commerce app. The simulator and local preview have their own explicit isolated launch paths.

## Before enabling hosted users

1. Back up PostgreSQL and rehearse restoration on an isolated copy.
2. Deploy the new source and requirements to staging. The migration adds company/member/invitation/quote-link/audit/content-history tables while retaining current records. See [migration and rollback](CORPORATE_WORKSPACE.md).
3. Check `/health`, `/ready/db`, authenticated `/v1/workspace/session`, and corporate/content operations. Verify failures for unauthorized accounts, expired invitations and stale revisions.
4. Register real team accounts, then use the operator command `python -m app.manage_staff --email <account> --role <role>`. Do not expose role grants publicly. Sign out/in after a role change.
5. Add privileged MFA and branch/record scopes before treating Command Center as release-ready. Existing role checks do not satisfy these remaining requirements.
6. Point the frontend's public `EXPO_PUBLIC_API_URL` at the deployed HTTPS API origin; configure real browser origins in CORS. Build and test Android/iPhone separately.

## Services needing approved contracts and new integration code

| Capability          | What Cake City must provision                                                                        | What is still to implement/verify                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Native payments     | Approved Pesapal/M-Pesa sandbox/account, API contract and callback registration                      | Live provider adapters, verified state transitions, Woo order reconciliation, real refunds and settlements |
| Enquest             | Approved API documentation, credentials and account mapping/points ownership                         | Adapter, member linking, synchronization, reversal and duplicate-award prevention                          |
| eTIMS               | Approved integration route/provider, credentials and seller/branch tax data                          | Fiscalization adapter, retry/audit workflow and legitimate tax invoice/credit-note downloads               |
| Delivery/production | Approved Leta/dispatch interface and Cake City zones, branch hours, lead times and capacity policies | Slots, cutoffs, multi-date fulfilments, real production/dispatch events and supported ETA data             |
| Messaging/identity  | Approved email/SMS/WhatsApp providers, sender identities, OAuth setup and push credentials           | Recovery email, OAuth verification, device registration, delivery workers, consent and opt-outs            |
| AI                  | Approved model provider/key, permitted data and usage budget                                         | Authenticated typed tools, audited orchestration, confirmation boundaries and evaluations                  |
| Monitoring/storage  | Approved monitoring service, durable media storage, backup/retention policy                          | Crash/trace reporting, asset lifecycle and operational recovery tests                                      |

Adding arbitrary environment keys for these services does not make them functional: most adapters do not exist yet. Configure secrets only when the corresponding implementation and staging verification are ready.

## Software still required

- Complete server-authoritative cake configuration/price/compatibility/lead-time rules.
- Corporate contract pricing, POs, deposits, invoices, approved credit and bulk fulfilments.
- CMS approvals/marquees/targeting and remaining Command Center operations.
- CRM profiles/segments, consent-aware lifecycle automation, reconciled analytics dashboards and reporting.
- AI concierge/copilot and the provider integrations above.
- Privileged MFA, branch scope, versioned schema changes, backup restore, security/performance/accessibility checks, native runtime validation and deployment verification.

The configured current service can support the implemented account, corporate quotation and content workflows. It is not the completed master-prompt platform.

## See the local changes now

From the repository root, run `npm run preview:local` and keep that terminal open. Open `http://localhost:8082/corporate` or `http://localhost:8082/command-center`. Local review credentials are generated in ignored `artifacts/local-preview/LOGIN.txt`; use the customer account for corporate flows and admin for Command Center.

This preview uses an isolated SQLite database, clears live integration credentials and disables website checkout. It browses the real public catalogue without inventing products. The test payment simulator remains a separate API-only service; it is not wired into consumer checkout. Ctrl+C stops the preview processes. If the temporary validated Python environment no longer exists, recreate one from `backend/requirements.txt` and set `CAKECITY_PREVIEW_PYTHON` to its executable path before starting.
