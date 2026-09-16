# Cake City API

Deployable FastAPI service for the Cake City mobile app. It uses Neon PostgreSQL in production and SQLite for local development.

## Local

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
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

Required environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `JWT_SECRET`: long random secret
- `CORS_ORIGINS`: comma-separated allowed origins, or `*` for the mobile-only API
- `ENVIRONMENT=production`

## Scope

This first deployable slice provides health checks, Neon persistence, customer registration/login/session rotation/logout, mobile capability config, and a WooCommerce catalogue proxy. Google identity, password email delivery, checkout quoting, delivery pricing, payment provider calls, orders, rewards, and push delivery remain disabled until their provider credentials and business rules are configured.
