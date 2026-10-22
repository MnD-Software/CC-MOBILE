# Cake City implementation ledger

Owner brief: supplied master prompt, sections 1–25. Start with the [22 October audit](SUPER_APP_AUDIT_2026-10-22.md). Status is evidence-based and must be revised after each increment.

## Architecture decision

Retain Expo Router + React Query + Zustand and the existing FastAPI/SQLAlchemy backend. PostgreSQL already exists as the production database choice; do not introduce another identity system, ORM or transactional database. Keep WooCommerce authoritative for product identity, selling price, stock, orders and existing website payments. New platform entities reference Woo IDs and must not independently overwrite them.

Create corporate and staff web applications as separate permission-controlled clients of the existing service when their first authenticated vertical slice is ready. A Next.js app is justified then by web table/accessibility/routing needs; it is not needed to fix mobile checkout or test payment behavior. Reuse API schemas/tokens through explicit contracts rather than sharing browser session secrets with native storage.

Ownership: app backend owns app accounts/addresses/celebrations/enquiries/editorial content; Woo owns commerce and website payments; Enquest must own loyalty once an approved integration contract is agreed. Local Club is an existing independent implementation, not an approved second Enquest writer. ERP recipe/ingredient data, dispatch and eTIMS authority require explicit operational agreements. An outbox with retry/deduplication is required before asynchronous live integrations; do not introduce Redis queues without a worker/recovery use case.

Production must fail startup with default JWT secrets, ephemeral storage or unsafe browser CORS. A separate test payment service must never be mounted on the commerce application. It owns only simulated records in a dedicated database, imports no live order/Club/dispatch route, and cannot issue fiscal invoices.

## Priorities and acceptance checklist

- [x] Phase 0: inspect actual source, branches, package manifests, API boundaries and existing tests; publish feature/risk matrix.
- [x] Phase 0: establish frontend/backend baseline and read Expo v57 documentation before edits.
- [x] P0: enforce production configuration on launcher and direct ASGI lifespan; test rejection without echoing secrets.
- [x] P0 backend test slice: isolated reviewer-protected simulated provider with authoritative fixture pricing, persistent idempotency, terminal state guards, amount/currency reconciliation, partial-refund limits, audit and clearly marked JSON test receipt. Tests cover success/failure/timeout/cancellation, duplicate/concurrent requests, unauthorized access and production rejection. Mobile simulator UI and review deployment remain separate work.
- [ ] P0: triage all npm/Python advisories against supported SDK packages; verify remedial changes without forced framework downgrades.
- [ ] P0 external: approved live mobile payments account and server verification/callback contract; retain existing website handoff until that is ready.
- [ ] P0 external: backend uptime, delivery slots/cutoffs/capacity and Enquest source-of-truth agreement.
- [ ] P1: versioned production schema migrations/rollback; backup and restore rehearsal.
- [ ] P1: stronger staff auth, granular role/branch/record permissions and append-only administrative audit before Command Center expansion.
- [ ] P1: owner font licensing/assets; design-token documentation and platform/device accessibility review. Preserve current white canvas and pink controls.
- [ ] P1: verified receipts, seller/tax metadata and approved eTIMS specification. Order confirmations and simulated receipts are never fiscal invoices.
- [ ] P1: first Command Center slice: signed-in content editor, schedule/preview/approval/history, customer-scoped order monitor; test every permission.
- [ ] P2: corporate organization + member roles + quote + approval + accepted order reference; no credit without staff approval and controls.
- [ ] P2: consent/preferences + event taxonomy + reconciled reporting + CRM segments; show source/freshness/attribution for every metric.
- [ ] P3: typed read-only AI discovery tools, then confirmed cart actions; no raw payment credentials or independent price setting.
- [ ] P1 release gate: deploy staging, run contract/payment/recovery E2E, test actual iPhone/Android runtime, verify EAS artifacts and store review requirements.

## Increment and rollback policy

Each schema change gets a version identifier, preconditions, forward operation, backup instructions and rollback plan. New test-payment tables are exclusively owned by the separate simulator metadata/database; they never enter the commerce migration. Rollback of that slice stops the simulator and restores/discards only its dedicated test database after verifying the resolved path. No automatic database deletion.

Production configuration guard rollback is application-code rollback; no schema alteration. Fix environment values rather than relaxing guards. Retain the previous deployment while applying new validated secrets/CORS/Redis settings in staging. JWT rotation invalidates prior access tokens and may require reauthentication.

## Deliverable status

Update after the owner's request to continue all phases: `/corporate` and `/command-center` now implement the first shared-backend workspaces. Corporate organizations, member invitations/roles/removal, shared quote requests and approver-only acceptance are implemented. Team requests, confirmed staff replies, scoped role permissions, content revision history/restoration and administrative event recording are implemented. See [corporate/workspace implementation and migration](CORPORATE_WORKSPACE.md). These additions are not the complete corporate module or Command Center: MFA, branch assignments, credit/invoicing, fulfilments, CRM, BI and AI remain open.

Audit, architecture/gaps/priorities and checklist are delivered here. Existing consumer code, design tokens, backend APIs and EAS configuration are retained. Dedicated corporate portal, full Command Center, CRM schemas, BI, AI orchestration, live provider adapters, fiscal receipts and production deployments remain incomplete. Do not report the overall master brief as completed from this increment.

Implemented this increment: production launch guards, separate test-payment APIs/schema, regression tests, sandbox migration/rollback runbook, npm critical-advisory patch, generated-directory Metro exclusions and a source-validation GitHub Actions workflow. The workflow has not run on GitHub; no commit/push/deployment was performed.

Validation before Python dependency remediation: 127 frontend tests, TypeScript, format checks, explicit-URL release preflight and Expo web export passed. Backend full run passed 72 tests; final targeted refinement run passed 33 tests. A real Uvicorn localhost HTTP request created a simulated payment, recorded success and returned its TEST receipt with zero revenue; service shutdown and temporary database cleanup succeeded. Native device behavior is unverified.

The first export completed despite the slow OneDrive crawl. The subsequent export with generated-directory exclusions and a warm cache bundled 1,915 modules in 8.1 seconds; this is not an isolated cold-start performance comparison. Output is local ignored `artifacts/reference-ui/export/`.

## Final validation for this increment

| Check                               | Result                                                  | Boundary                                                                                        |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Frontend `npm test`                 | 127 passed                                              | Local source/regression tests                                                                   |
| TypeScript                          | Passed                                                  | `npm run typecheck`                                                                             |
| Formatting                          | Passed                                                  | Existing scoped check plus new Markdown/workflow/Metro files                                    |
| Backend clean-environment suite     | **73 passed**, one TestClient/httpx deprecation warning | Python 3.12, patched requirements; actual HTTP boundaries tested                                |
| Python dependency consistency       | `pip check` passed                                      | Fresh environment outside OneDrive                                                              |
| Python dependency audit             | 0 known advisory records across 38 packages             | Exact scanned environment; old `.venv`/deployment not updated                                   |
| npm audit                           | 0 critical; 27 high + 6 moderate remain                 | Supported SDK-compatible remediation still required                                             |
| Release configuration               | Passed with explicit deployed HTTPS API URL             | Does not prove backend availability                                                             |
| Expo web export                     | Passed                                                  | Local `artifacts/reference-ui/export/`, not deployed                                            |
| Simulator real localhost HTTP smoke | Passed                                                  | Simulated success/TEST JSON receipt, zero real revenue; server stopped and temporary DB cleaned |
| Git whitespace                      | Passed                                                  | `git diff --check`                                                                              |
| Live integration/native device      | Unverified                                              | Backend read probes timed out; no live order/payment/device operation                           |

The final FastAPI upgrade required replacing a test's assumption about private router objects with real 404 requests and OpenAPI-path assertions. Existing account, Club, content, address, tracking and startup regression tests pass on the new framework. Test JWT signing keys are now generated per test session rather than overriding them with a short static value.

## Corporate/workspace validation increment

- Full backend suite: 80 passed, including new corporate/content permission and revision scenarios. A subsequent targeted run covers the final membership-output and concurrent-registration refinements.
- Frontend suite: 130 passed, including three new rendered-web tests for guest privacy, role-specific visibility and genuine empty/error states.
- TypeScript and Expo web export pass with the new routes. Native devices and interactive browser flows have not been verified.
- Migrations are additive and documented, with code rollback retaining new records. Hosted databases were not migrated, and no invitation email, payment, campaign publication or deployment was executed against production.
- Provider configuration information was requested for the external integration phases. Source work on unconnected capabilities must remain clearly distinguished from verified production integration.

## Local preview handoff

Run `npm run preview:local` from the repository root. The corporate and Command Center routes are available at `http://localhost:8082/corporate` and `http://localhost:8082/command-center`. Review account passwords are in ignored `artifacts/local-preview/LOGIN.txt`. Use customer for corporate flows and admin for the team workspace. The isolated SQLite review database has no production credentials; website checkout is disabled for this preview. The local review flag is rejected by release configuration checks.

Final checks after preview setup: 131 frontend tests and 83 backend tests passed; TypeScript and formatting passed. The release-guard refinement passed seven targeted recovery tests. Real disposable-browser sign-in and navigation to both workspaces passed against the local API without mocked responses or runtime errors; screenshots and the result are in `artifacts/local-preview/`. No hosted source, database or frontend was deployed. See [backend deployment steps](BACKEND_SETUP.md).

## GitHub release handoff

This source increment packages the corporate/workspace foundation, production guards, isolated payment simulator, local preview tooling, dependency fixes, tests and documentation for the existing `MnD-Software/CC-MOBILE` repository. Earlier deployment-status statements above describe their implementation checkpoints. Verify the running backend's deployed commit separately after pushing; a new GitHub commit does not establish backend, web or native release completion. The unrelated preview APK and all generated credentials/databases remain excluded.
