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

## Purchase and billing review increment

The local mobile simulator UI is now implemented at `/purchase-test`, with an explicit preview entry, private test-account pairing, server-priced synthetic cupcake, persisted request recovery, 25 test points per successful purchase, Silver after two purchases and Gold after four. Each successful test purchase atomically stores an immutable receipt snapshot; it can be opened from history and exported/shared using Expo Print. Failure, timeout and cancellation create no points or payment receipt. Production rejects this pairing mode, and release configuration rejects its client URL. See [the review guide](PURCHASE_TEST.md).

`/billing-details` adds an explicit account-scoped Save action independent of placing an order, with normalization, validation, storage failure feedback and checkout restoration. It retains the existing native secure storage and memory-only browser privacy model. Server billing profiles, KRA/eTIMS, live native payments and approved Enquest writes remain incomplete. This source increment is local; it is not a hosted deployment, EAS release or completion of the full master brief.

Validated 24 October: full frontend suite 137 passed; full backend suite 92 passed with the existing TestClient deprecation warning. Final targeted payment/billing/accessibility and checkout boundary checks passed after the iPhone-compatible timeout and billing-focus refinements. TypeScript, formatting, release configuration and Git whitespace checks passed. The real browser/API flow completed four purchases (25/50/75/100 points; Bronze/Silver/Silver/Gold), all three unsuccessful outcomes, billing validation/save/restore and a standalone TEST PDF export without external writes or runtime exceptions. The PDF parsed as one A4 page with 10.5/12/21 pt text. The iOS SDK 57 manifest and bundle returned HTTP 200 with the new purchase, billing and print modules. Evidence is in ignored `artifacts/purchase-test/`; actual native iPhone printing/sharing remains unverified.

## SDK 58 compatibility increment

The project now targets SDK 58 to match the iPhone's Expo Go 58.0.5 / supported SDK 58.0.0. Expo 58.0.19, React Native 0.88.0 and React 19.3.0 are installed with the aligned native dependencies. App/package version is 0.3.0. Strict ref types and root tab navigation were migrated; all seven build patches apply cleanly and all 12 patched files match the intended diffs. See [upgrade details](SDK_58_UPGRADE.md).

Validated on 24 October after upgrading: 137 frontend tests passed; the final TypeScript, formatting and production configuration checks passed. Expo's dependency check reports no mismatches. Expo Doctor's online schema check failed because its TLS connection to the Expo API could not be established; the other checks completed. The iOS manifest reports SDK 58.0.0 / app 0.3.0 and its 12,616,883-byte bundle returned HTTP 200 with purchase, billing and print modules. The first OneDrive bundle build was slow; subsequent browser bundles completed in seconds. The real browser/API flow again passed four purchases, membership upgrades, unsuccessful outcomes, billing save/restore and TEST receipt PDF export. Evidence: `artifacts/sdk58-upgrade/ios-verification.json` and `artifacts/purchase-test/browser-verification.json`. Actual iPhone runtime and print/share-sheet testing, native binary builds, GitHub delivery and hosted deployment of this increment remain unverified or unperformed.

## Independent simulated checkout and postal code fix

Main `/checkout` now renders the explicitly configured in-app simulated payment flow, including payment confirmation, points, membership and receipts. It has no browser payment handoff. If no test service is configured, it shows that in-app payments are unavailable and keeps the bag. The synthetic KES 100 cupcake is clearly distinguished from the real bag, which remains untouched. The old website form is retained only as an unmounted migration component. Real Daraja/Pesapal adapters remain unimplemented; no live provider has been activated.

Read-only inspection of the live website's Kenya address locale confirmed that postal code is required and field labels are absent. The old adapter always sent an empty postcode, explaining the reported unlabelled billing error. Billing profiles now save a required five-digit postal code with leading zeroes intact. Older profiles retain their data and request the missing code on the next save. The retained adapter also validates the code before submission and gives useful feedback for unlabelled address errors. No production order/payment was used to diagnose or test this change.

The purchase-preview runner now accepts 172.16–31 private networks and excludes common virtual adapters, so the generated QR uses the current physical Wi-Fi/hotspot interface. Its QR opens `/checkout` directly. Tests cover independent checkout and its unavailable state, postal-code persistence/migration, rejected missing codes and normalized request data. Full frontend suite: 142 passed. TypeScript passed; iOS manifest/bundle verification includes the new independent checkout and postal-code validation. The real browser/API flow passed all four purchases on `/checkout` without leaving the app, all unsuccessful outcomes, postal-code validation/save/restore and TEST PDF export, with zero runtime errors or external writes. Evidence: `artifacts/purchase-test/browser-verification.json` and `artifacts/sdk58-upgrade/ios-billing-postcode-8083.json`. Native iPhone runtime/share-sheet verification and production deployment remain outstanding.

The reported unavailable message was traced to the ordinary Expo Go launcher starting without the simulator configuration. `npm run start:go` now starts the connected simulator with Expo Go on port 8081; `npm run preview:purchase` uses the same runner on port 8083. Run one at a time. The browser verification reads the current preview origin, and the iOS bundle check asserts that the simulator URL is present. Both checks passed on port 8081; the updated bundle evidence is `artifacts/sdk58-upgrade/ios-billing-postcode-8081.json`.

Expo Go's empty session list was traced separately to the launcher's forced `CI=1`: Expo CLI's `DevelopmentSession.startAsync` explicitly skips account discovery in CI. The runner now clears inherited CI without setting it again. The existing live preview was registered with Expo's development-session API using the CLI's signed-in account; Expo accepted the registration. Evidence: `artifacts/purchase-test/expo-go-session-verification.json`. The iPhone must use the same Expo account as the CLI; the current computer account was verified as `marcos_noel23`. Actual display of the session on the iPhone remains user-side verification.

## Connected purchase cycle and layout correction

The global purchase banner and duplicated checkout membership/history panels have been removed. The existing shell, colours, navigation and membership card remain. Checkout shows the reward cupcake, points earned, saved/editable billing and one payment action. Successful payment opens a saved receipt with links to Club and Orders. Preview disclosure is compact and confined to payment and receipt details; payment remains simulated and creates no live stock, revenue, loyalty or WooCommerce order.

In the explicitly configured local preview, Club, Profile, Club transactions and Orders now read the same paired member's server-confirmed purchase state. Payments refresh the relevant query caches. Successful transactions link to their immutable receipt; failed outcomes add no reward transactions; refund adjustments reduce the displayed points. The Club card upgrades to Silver after two qualifying purchases and Gold after four. Production keeps its existing Club and website-order boundaries, and preview reward redemption cannot call the live backend.

Validated 24 October: 143 frontend tests passed; final TypeScript and formatting checks passed. The real browser/API flow completed four purchases through checkout, receipt, normal Club, transactions, receipt links and Orders. It verified the original receipt after later purchases, all three unsuccessful outcomes with zero new points/transactions, and PDF export. Pointer clicks verify visible buttons are not covered after scrolling. Phone-width screenshots were inspected. Evidence: `artifacts/purchase-test/browser-verification.json`, `cycle-unit-tests.log`, `checkout-clean.png`, `club-gold.png`, `club-transactions.png`, `purchase-orders.png` and `purchase-receipt.png`. SDK 58 iOS manifest/bundle checks passed. Actual iPhone runtime/printing, GitHub delivery and hosted deployment remain unverified or unperformed for this increment.

## Milestone progress and celebration increment

The isolated purchase preview now reaches Silver after two purchases, Gold after four, Diamond after five and Platinum after six. The current card and Club progress bars animate toward Platinum while naming the next milestone. Each tier has a distinct card colour. A root-level observer celebrates a newly confirmed upgrade with confetti from both sides and a dismissible **View new card** prompt. Navigation reveals the front of the updated card, without adding a payment banner or changing the existing screen structure. Reduce Motion suppresses confetti and bar animation. Opening an existing membership, refreshing or switching accounts establishes a baseline without replaying celebrations. Refunding and regaining an already celebrated tier within the same app session also does not replay it.

The short thresholds apply only to local synthetic purchases. Live Club thresholds are unchanged; historical receipts retain their saved tier and points. Restart `npm run start:go` to load the updated Python rules, then reload Expo Go. Existing purchases and the pairing code are retained. A fresh preview membership can be started in operator review controls to exercise the complete sequence again.

Automated validation on 24 October: 147 frontend tests and 33 targeted backend payment tests passed. Coverage includes tier progression through Platinum, duplicate completion, immutable receipts, refunds and duplicate refund events, membership schema compatibility, progress calculation and celebration deduplication. Final TypeScript and formatting checks passed.

The real browser/API flow passed six purchases through Platinum with 25/50/75/100/125/150 points, matching Club transactions, Orders and immutable receipts. It verified all four milestone prompts, side confetti contained within the viewport, touch navigation to the visible updated card, animated progress reaching each confirmed value, Reduce Motion and dismissal. Failure, timeout and cancellation left points and reward transactions unchanged; the original receipt remained unchanged after later purchases and exported to PDF. No runtime exceptions or external writes occurred. Phone-width screenshots of Silver, Gold, Diamond and Platinum were inspected. Evidence: `artifacts/purchase-test/browser-verification.json`, `milestone-*.png`, `club-*.png` and `TEST-receipt.pdf`. The SDK 58 iOS manifest and bundle returned HTTP 200 and included both milestone components (`artifacts/sdk58-upgrade/ios-billing-postcode-8084.json`). Actual iPhone runtime/printing, GitHub delivery and hosted deployment remain unverified or unperformed for this increment.
