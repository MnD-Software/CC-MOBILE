# Isolated TEST payment service

This is a backend testing slice, not a live provider or consumer checkout replacement. Commerce never mounts these routes. No live orders, dispatch, loyalty, messages, funds or fiscal documents are created. Mobile retains WooCommerce checkout.

## Local startup

From `backend`, use values from `payment-sandbox.env.example` in a separate process. Generate two different secrets privately with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Keep them out of tracked files.

```powershell
$env:ENVIRONMENT = 'development'
$env:PAYMENT_SANDBOX_ENABLED = 'true'
$env:PAYMENT_SANDBOX_ISOLATED = 'true'
$env:PAYMENT_SANDBOX_DATABASE_URL = 'sqlite:///./cakecity-payment-sandbox.db'
# Privately set PAYMENT_SANDBOX_ACCESS_TOKEN and PAYMENT_SANDBOX_WEBHOOK_SECRET.
..\.venv\Scripts\python.exe -m uvicorn app.payment_sandbox:create_sandbox_app --factory --host 127.0.0.1 --port 8011
```

Open `http://127.0.0.1:8011/docs`. Supply `authorization: Bearer <sandbox reviewer access token>` on protected operations. This credential grants a dedicated reviewer identity unrelated to commerce JWTs. There is no default token/public registration. Rotating it changes the reviewer identity; retain test evidence first.

Staging/review requires a separate private service, test-only persistent volume, TLS and authenticated ingress with traffic/body limits. One SQLite-backed instance is supported. Review hosting and store credentials have not been provisioned.

## API test flow

Responses carry `X-CakeCity-Simulated: true` and `Cache-Control: no-store`. Payments carry `simulated: true`, `provider: simulated` and a `TEST-` ID. Amounts are integer KES minor units.

1. `GET /v1/test-payments/catalogue` returns synthetic server-priced fixtures.
2. `POST /v1/test-payments`: `{"request_key":"unique-key-at-least-16-chars","lines":[{"sku":"TEST-CAKE","quantity":1}]}`. Client prices are rejected. Exact retries recover the same payment across restarts; conflicting cart data returns 409.
3. `POST /v1/test-payments/{id}/simulate`: `{"event_key":"unique-event-at-least-16-chars","status":"succeeded","amount_minor":350000,"currency":"KES"}`. Other terminal outcomes: `failed`, `timed_out`, `cancelled`. Timeout is explicitly simulated, not a real network/settlement result.
4. `GET /v1/test-payments/{id}` verifies persisted state.
5. `POST /v1/test-payments/{id}/refunds` accepts `request_key` and `amount_minor`. Partial/full refunds cannot exceed successful payment. Exact retries do not repeat refunds; changed details return 409. `refunded_minor` tracks adjustment separately from payment status.
6. `GET /v1/test-payments/{id}/receipt` returns JSON after simulated success, labelled **TEST — SIMULATED PAYMENT — NOT A TAX INVOICE**, with no settlement/fiscalization and zero real revenue. PDF/email receipts are not implemented.
7. `GET /v1/test-payments/{id}/audit` returns events, amounts and timestamps. No event update/delete API exists.

The optional `/webhook` also requires `X-Sandbox-Signature`: hex HMAC-SHA256 over UTF-8 payment ID, a literal `.`, and exact body bytes using the webhook secret. Reviewer auth is still required. The signature binds the payment ID; event keys deduplicate replays. Conflicting payloads/amounts/currencies are rejected. This is not Pesapal's production callback contract.

## Migration sandbox-v1 and rollback

Preconditions: isolated non-production enablement, distinct secrets, dedicated SQLite filename containing `payment-sandbox`. Verify resolved absolute location and ownership. Existing business tables cause startup to refuse modifications.

Forward: create `sandbox_payments_v1` and `sandbox_payment_events_v1` with separate metadata. Commerce migrations never create these tables. Unique keys and conditional database updates protect concurrent idempotency, terminal outcomes and refund limits.

Rollback: stop the simulator, back up its dedicated test file and revert service code. Commerce requires no schema rollback. Restore only with matching sandbox-v1 code. Never delete/move a computed path without checking its absolute target. Future column changes require versioned migrations; `create_all` is not an alteration mechanism.

Tests cover isolation, production rejection, role credentials, fixture prices, restart recovery, signatures, reconciliation, four outcomes, replay conflicts, refunds and concurrency. They do not prove live provider/native behavior.

Pesapal/M-Pesa adapters, live order orchestration, payment UI, review deployment, real refunds, settlement jobs, PDF receipts and eTIMS remain incomplete. Never select the simulator in mobile production.
