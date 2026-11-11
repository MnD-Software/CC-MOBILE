# Release readiness

**Status: not approved for production release.** This is a source review and
local test record, not a deployment or store sign-off.

## Required before release

- [ ] Provision and verify private SMTP delivery before enabling password
  recovery; Google sign-in remains HTTP 501 and must stay unavailable until
  provider verification and account-linking policy are approved.
- [ ] Verify production HTTPS API URL, capabilities, auth, account ownership,
  payments, callbacks, idempotency and recovery using dedicated test accounts.
- [ ] Deploy the backend and run `python -m app.start` so required additive
  tables are created; verify database backup and rollback procedures.
- [ ] Confirm the hosted tracking route and schema, then test rider/customer
  isolation on signed iOS and Android devices.
- [ ] Validate fulfillment zones, slots, branch policies, order confirmation and
  receipt/tax wording with operations and finance.
- [ ] Test account recovery, deletion/export and notification consent against
  approved privacy and retention policies.
- [ ] Run current dependency/security review and release checks with the intended
  production environment. Do not downgrade Expo/React Native to satisfy an
  automatic audit recommendation without compatibility review.
- [ ] Complete responsive, accessibility, cold-start, offline/network recovery
  and real device tests; verify final signed artifacts and store metadata.
- [ ] Keep concierge disabled until API billing, privacy, rate limits and provider
  acceptance are approved.

## Current evidence

TypeScript, 185 frontend tests, focused tracking and password-recovery backend
tests, and the isolated WooCommerce bridge harness passed locally. No production
service, email, payment, database, or native device was changed or verified.
