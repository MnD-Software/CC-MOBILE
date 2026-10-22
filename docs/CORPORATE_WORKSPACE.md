# Corporate commerce and Command Center foundation

Implemented routes: `/corporate` and `/command-center`, using the existing Expo Router application on web and mobile. Company access is linked from Account. Existing non-customer team roles see Command Center; the server always checks the current database role. These are initial functional workspaces, not completion of the full master brief.

## Functional corporate flow

Register a company with its billing address, invite an existing app account by email, privately share its three-day invitation code, and accept it while signed in as the matching email. Invitations are hashed at rest, single-use and cannot grant ownership or change an existing member's role. No invitation email provider is claimed. Owners manage colleague roles and revoke access with confirmation; ownership cannot be removed through those operations.

Owners, approvers and buyers submit shared corporate quotation requests. Viewers only read. Requests appear in the existing staff enquiry queue. Sales prepares a price and expiry, then explicitly confirms saving its reply. Only an owner or approver can accept through the corporate endpoint. The personal endpoint rejects corporate approval attempts, preventing a buyer bypass. Acceptance is revision-bound, expiry-checked and idempotent. It does not collect money or create a paid WooCommerce order. Credit facilities remain disabled.

Corporate memberships scope all company records. Responses containing invitations and account data receive existing private/no-store middleware headers. Browser credentials stay in memory; native credentials retain existing SecureStore behavior. New query keys include the account identity and are removed on sign-out by the existing private-cache boundary.

## Permissions

| Staff role                               | Content    | Customer requests | Audit |
| ---------------------------------------- | ---------- | ----------------- | ----- |
| admin                                    | Read/write | Read/write        | Read  |
| staff, ecommerce_manager                 | Read/write | Read/write        | None  |
| marketing_manager, content_manager       | Read/write | None              | None  |
| corporate_sales, sales, customer_service | None       | Read/write        | None  |
| executive                                | Read       | None              | Read  |
| finance                                  | None       | None              | Read  |
| analyst                                  | Read       | None              | None  |
| branch_manager, production, dispatch     | None       | None              | None  |

Branch roles intentionally receive no global access until branch assignment and record filtering exist. The matrix applies to the new workspace and enquiry/content APIs. Older Club/catalogue administration retains its existing admin/staff boundaries; this is not yet a universal permission system. No client role or stale JWT role authorizes server access.

Use the existing operator-only `python -m app.manage_staff --email <existing account> --role <role>` command to provision a role. No public staff-role grant endpoint is introduced. Privileged MFA and branch/record assignments remain production release gates.

## Content and audit

Content updates atomically compare revisions, append snapshots and record audit metadata in the same transaction. Command Center exposes content history and confirmed restoration as a new draft. Restoration never automatically republishes an old campaign. Existing content is snapshotted on its first subsequent edit. Company creation/invitations/membership changes, corporate requests/acceptance, staff replies and content saves record administrative events. Raw invitation tokens, addresses and request messages are excluded from audit metadata. There is no audit edit/delete API; database-level tamper protection and retention remain operational work.

## Migration 20261022-corporate-workspace-v1

Forward tables: `organizations`, `organization_members`, `organization_invitations`, `organization_enquiries`, `administrative_events`, `editorial_revisions`. All are additive; existing customer, order/Club and content records remain intact. Run `python -m app.migrate` before deploying the new application. The existing launcher runs it before workers start. No deployed database was migrated during implementation.

Preflight: back up PostgreSQL with your managed provider, verify restore into an isolated database, run the migration there, verify existing row counts and constraints, then run the corporate/content tests against staging. Organization registration serializes per customer; quote approvals and content updates use atomic conditions. Unique constraints protect organization registration retries and revision identity.

Rollback: stop the new web/mobile entry points and restore the previous application version while retaining the six additive tables. Old code ignores them. Do not drop company, membership, invitation, audit or history records as an automatic rollback. A destructive schema removal requires a separately reviewed export/retention decision. Backups/restore have not been rehearsed against the hosted database.

## Remaining work

Corporate contract/volume pricing, KRA metadata, POs, invoice generation, deposits, credit controls, bulk/multi-date fulfilments and corporate analytics are not complete. Command Center still needs privileged MFA, branch scoping, operations events, CRM/marketing automation, reconciled business analytics, CMS approvals/marquees, AI tools and provider integrations. Screens are typechecked, rendered in automated web tests and exported; actual browser interaction/accessibility and native-device QA are still required. Do not deploy this foundation as the complete requested platform.
