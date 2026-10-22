# Dependency remediation — 22 October 2026

Initial npm audit: 34 findings (1 critical, 27 high, 6 moderate). Updating only transitive `shell-quote` from 1.10.0 to 1.12.0 removes the critical finding; 33 high/moderate findings remain. The change preserves Expo 57, React Native 0.86 and native dependency versions. See the [reviewed shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). Automatic audit suggestions include incompatible framework downgrades and were not applied. Do not treat zero critical findings as a clean npm audit.

Initial Python installed-environment scan reported 38 advisory records across PyJWT 2.10.1, Starlette 0.41.3, pytest 8.3.4 and certifi 2026.7.22. Some records can refer to the same underlying issue. Results are local ignored JSON under `artifacts/`; no environment values or customer records were included.

Remediation pins: FastAPI 0.159.1, Starlette 1.9.0, PyJWT 2.15.1, pytest 9.0.3 and certifi 2026.10.19. FastAPI's published dependency metadata accepts Starlette >=0.46.0; the chosen Starlette requires Python >=3.11. Validation targets Python 3.12. See [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/) and [PyJWT security changes](https://pyjwt.readthedocs.io/en/stable/changelog.html). Existing application APIs and database models are retained.

The existing OneDrive `.venv` denied an in-place package update. Its original package imports were rechecked and remain available. Validate the new pins in a fresh environment outside OneDrive instead. This run records that environment's path in ignored `artifacts/validation-environment-2026-10-22.txt`. Recreate your development environment from `backend/requirements.txt` before relying on the patched Python packages; running the old `.venv` continues to use its old versions.

Rollback: retain the previous application image/requirements snapshot in staging. No database schema migration is coupled to these library changes. On a regression, restore the previous application image and keep the security issue open; do not describe the vulnerable versions as resolved after rollback. Native SDK dependency remediation still requires supported Expo patches and actual Android/iOS build validation.

Post-remediation scan of the fresh validation environment completed with **no known vulnerabilities found**. `pip check` also passed. Snapshot: `artifacts/python-dependency-audit-after-2026-10-22.json`; exact scanned versions: `artifacts/python-validated-2026-10-22.txt`. This covers the newly installed test environment, not the older workspace `.venv` or deployed service. Full regression results are recorded in the implementation ledger.

The patched environment passed all **73 backend tests**. One non-failing warning remains: Starlette's TestClient deprecates its httpx adapter in favor of httpx2. The application continues to use its existing httpx integration; this increment does not add a second HTTP client merely to silence a test warning.
