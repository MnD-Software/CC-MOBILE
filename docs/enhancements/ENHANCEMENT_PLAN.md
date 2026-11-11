# Enhancement plan

Updated 11 November 2026. This is a staged plan for the master enhancement
brief, not a claim that the full brief is complete. The repository's existing
[implementation ledger](../SUPER_APP_IMPLEMENTATION.md) and
[October audit](../SUPER_APP_AUDIT_2026-10-22.md) remain the architectural
history; verify current source before relying on older status statements.

## Guardrails

- Preserve the existing Expo Router, FastAPI, SQLAlchemy and payment boundaries.
- Treat live service behavior, native behavior and local test results separately.
- Do not add mock customer/product/payment data to production paths.
- Do not deploy, migrate a production database, activate paid services, or charge
  customers without explicit approval.
- Do not introduce identity, payment, loyalty or ERP ownership changes without
  an approved integration contract.
- Resolve the Expo SDK version from the package lock and app configuration.
  The current project is SDK 58; the repository instruction still directs
  agents to consult the versioned SDK 57 reference before code changes. Read the
  SDK 58 upgrade notes before making any SDK-specific change.

## Priority sequence

### P0 - Production correctness and account lifecycle

1. Keep server-side order repricing, payment confirmation and idempotency as
   release requirements; exercise retries, provider failures and lost responses.
2. Provision and verify private SMTP settings before enabling the implemented
   password-recovery flow. Implement Google sign-in only after identity-provider
   credentials and account-linking policy are agreed; its route remains HTTP 501.
3. Verify deployed API capabilities, database schema, payment callbacks, delivery
   rules and privacy behavior before enabling production actions.

### P1 - Customer experience, operations and native acceptance

1. Finish review of the current order journey, rider location-sharing flow,
   search, Club, image loading and button/accessibility work.
2. Add device-level checks for permission prompts, foreground/background
   behavior, screen-reader use, text scaling, deep links and location privacy.
3. Verify staff/rider role boundaries, branch scopes and audit records against
   real test identities.

### P2 - Growth and business workflows

Prioritize consent-aware marketing, corporate approvals, custom-cake quoting,
gift/occasion workflows and loyalty interoperability only where the current
backend contract is authoritative and tested. Keep unsupported functionality
explicitly unavailable rather than fabricating prices, rewards or availability.

### P3 - Analytics and intelligent commerce

Introduce a versioned event taxonomy and reconciled metrics first. Keep concierge
disabled until provider billing, privacy review, usage controls and real-service
acceptance are approved. Prefer deterministic search and recommendations when
they meet the need.

## Acceptance gates

- Each increment has a focused regression test and an updated entry in
  [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).
- API and database contracts are versioned and backward-compatible.
- Production readiness is based on a deployed HTTPS service and signed-device
  checks, not only local web or mock tests.
- No release claim omits the remaining blockers listed in
  [RELEASE_READINESS.md](RELEASE_READINESS.md).
