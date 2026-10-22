# Cake City API

Deployable FastAPI service for the Cake City mobile app. It uses Neon PostgreSQL in production and SQLite for local development.

## Local

Use Python 3.12 for the validated dependency set (minimum 3.11). If OneDrive prevents package replacement, create the virtual environment outside the synced directory and install `requirements.txt` there; the older environment does not automatically receive security updates.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = 'sqlite:///./cakecity-dev.db'
$env:JWT_SECRET = 'local-only-secret'
uvicorn app.main:app --reload
```

Health checks:

- `GET /health`
- `GET /ready/db`
- `GET /docs`

## Render

Create a Web Service from the GitHub repository with root directory `backend`:

- Runtime: Python
- Build: `pip install -r requirements.txt`
- Start: `python -m app.start`
- Health check: `/health`

Required environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `JWT_SECRET`: long random secret
- `CORS_ORIGINS`: explicit comma-separated HTTPS origins, or empty for native-only access
- `REDIS_URL`: provisioned shared rate-limit/cache service; required in production
- `ENVIRONMENT=production`

## Scope

Every production launch path, including direct Uvicorn, rejects ephemeral storage, default/short JWT signing secrets, wildcard/non-HTTPS CORS origins and absent shared rate limiting. Provision and verify these settings in staging before deployment. Empty CORS origins allow native clients without enabling browser cross-origin access.

The separate [TEST payment service](../docs/PAYMENT_SANDBOX_RUNBOOK.md) is available for isolated backend scenarios. It is never mounted on this commerce application and cannot create live orders or collect funds.

The backend now includes Club membership and ledger APIs, verified WooCommerce order linking and webhook reconciliation, reward coupon issuing, birthday/referral benefits, cloud saved codes, celebration dates, and staff-managed support/custom/corporate quote requests. Public catalogue reads use bounded caching and reused upstream connections; Redis enables shared cache and rate limiting.

Production startup runs schema validation/migration once before launching Uvicorn through `python -m app.start`. This also works on Render free services, which do not support a separate pre-deploy command. Default worker count is one; `WEB_CONCURRENCY` can override it. Use persistent PostgreSQL for customer data.

After deployment, run `python verify_deployment.py https://cc-mobile-1.onrender.com` to check that Club routes and database readiness are available. See [the 8 October diagnosis](../docs/SHOP_CLUB_FIX_2026-10-08.md).

These features require deployment and the applicable WooCommerce/Redis configuration. Google identity, password email delivery, authoritative delivery slots, quote deposits, remote push campaigns and native payment-provider calls are not implemented by this release. Website checkout remains the payment authority.

See [the release checklist](../docs/ENHANCEMENT_RELEASE.md) for defaults, server environment variables, API operations, validation limits and unfinished roadmap work.
