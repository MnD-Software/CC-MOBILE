# Implementation log

## 11 November 2026 - Baseline review and reporting

### Scope

- Compared the supplied master enhancement brief with the current source,
  configuration, tests and recent documentation.
- Preserved the existing worktree. At review time it contained 26 modified
  tracked paths and 14 untracked paths; these were already present and are not
  attributed here to Codex or to this documentation pass.
- Added the requested evidence-based status, API, database, UI/UX, test and
  release reports under `docs/enhancements/`.
- Corrected the README's stale Expo SDK label from 57 to 58 and linked the SDK
  58 upgrade notes.

### Existing work observed, not authored by this pass

The current worktree includes a live order journey, trip-scoped foreground rider
location sharing, server-side location validation, dispatch and rider UI
changes, recently-viewed behavior, button layout changes, concierge/shortcut
changes, and tests/docs for these features. Git shows two 11 November commits
by Marcos Noel; that fact alone does not establish who made the separate
uncommitted edits. Available session history did not provide a Codex transcript
for this repository today.

### Validation evidence

- `npm test`: 185 passed, 0 failed.
- `npm run typecheck`: passed.
- `backend` live tracking tests: 4 passed; one Starlette/AnyIO deprecation
  warning.
- WooCommerce bridge isolated contract harness: 15 checks passed.
- These are local checks only. Full backend-suite, hosted deployment and signed
  iOS/Android device acceptance were not established in this increment.

See [TEST_RESULTS.md](TEST_RESULTS.md) for scope and limitations.

## 11 November 2026 - P0 account recovery

- Implemented fixed-scheme, single-use 30-minute reset links using
  `password_reset_tokens`; only token hashes are persisted.
- Added same-response account-enumeration protection, a 15-minute resend
  cooldown, backend-only SMTP STARTTLS delivery, and startup validation when the
  feature is explicitly enabled.
- Password reset atomically consumes the token, changes the password, revokes
  refresh sessions, disables their bound push devices, and invalidates other
  outstanding reset tokens.
- Connected the existing forgot/reset screens to the real auth form/API.
- Email delivery is disabled by default; no SMTP credentials or live email were
  used. Google sign-in, export/deletion and live-service acceptance remain open.
- Validation: 21 focused backend auth/config tests passed; the 185-test frontend
  suite, TypeScript check and Prettier check passed. A broader backend-suite run
  was stopped before completion and is not counted as a pass.
- Local review preview is available at `http://localhost:8082`; the sign-in,
  forgot-password, Shop and Orders screens were opened in the browser. The
  preview showed the floating tab bar covering the sign-in form, so it is now
  hidden on authentication routes. The updated sign-in and reset form were
  reopened and visually checked. This is a local web check, not native-device
  validation.
