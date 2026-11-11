# Test results

Local validation recorded on 11 November 2026 for the current worktree:

Finishing-pass verification:

- `npm test`: **185 passed, 0 failed** after updating the existing layout contract to expect the category sheet rather than the removed sidebar.
- `npm run typecheck`: passed for the tracking, Shop and navigation changes.
- From `backend`, `.venv` Python ran `pytest tests/test_live_tracking.py tests/test_logistics.py tests/test_order_experience.py tests/test_pesapal.py tests/test_dashboard.py tests/test_password_recovery.py -vv -o faulthandler_timeout=60`: **68 passed**, with one existing Starlette/AnyIO deprecation warning. This is a focused suite, not every backend test.
- `node scripts/verify-local-preview.cjs --layout --experience --checkout --logistics --live-tracking --notifications --dashboard`: **passed at 11:18 UTC**, no browser errors. Verified category-sheet apply/clear, full-width Shop at 320/375/390/430/1280, predictive search, Club, no-charge checkout, kitchen assignment/readiness, rider allocation and transit, a customer map marker and a second synthetic GPS fix, delivery proof/completion, HTML dashboard production/driver allocation, the exact notification deep link, persisted review and pickup handover. The ignored `artifacts/local-preview/browser-verification.json` contains per-flow evidence and order references.
- Scoped Prettier formatting and `git diff --check` passed. The map HTML was formatted after the first style check; the targeted recheck passed.

The earlier evidence table below is historical within this date; the finishing-pass results above apply to the latest reviewed changes.

| Check                                                                                                          | Result                                           | Scope / limit                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                                     | 185 passed, 0 failed                             | Node regression suite; not a native runtime test.                                                                                                                                                                |
| `npm run typecheck`                                                                                            | Passed                                           | TypeScript compile check.                                                                                                                                                                                        |
| Local browser preview                                                                                          | Sign-in, forgot-password, Shop and Orders opened | Found and fixed floating-tab overlap on auth routes; web-only, not a native-device check.                                                                                                                        |
| `backend` `pytest tests/test_live_tracking.py -q`                                                              | 4 passed                                         | Location ownership, status, ordering, privacy and flow tests; one Starlette/AnyIO deprecation warning.                                                                                                           |
| `backend` `pytest tests/test_password_recovery.py tests/test_production_config.py tests/test_auth_races.py -q` | 21 passed                                        | Generic responses, cooldown, single-use/expired tokens, password change, refresh/push revocation, SMTP TLS/deep-link, delivery-failure cleanup and configuration guard. One Starlette/AnyIO deprecation warning. |
| `php integrations/woocommerce/tests/bridge-test.php`                                                           | 15 bridge contract checks passed                 | Isolated fake WooCommerce harness; not a live store integration test.                                                                                                                                            |

Not established by these checks:

- Full backend test suite, static/security dependency audit or production database
  migration. A broader backend-suite run was stopped at 28% and is not counted
  as passing.
- Hosted API behavior, live Pesapal callbacks/refunds, email delivery, Google
  identity or push delivery.
- Signed Android/iOS builds, physical GPS accuracy, background location,
  Siri/launcher shortcut behavior, accessibility on devices or store approval.
- Public map tile service availability/usage compliance at production traffic.

Run focused tests after each change and record the exact command and boundary.
Do not infer production readiness from a passing local suite.
