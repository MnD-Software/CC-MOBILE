# Database changes

## Current worktree schema addition

`backend/app/logistics_models.py` defines `rider_positions`, keyed by delivery
task. It stores the rider identity, one latitude/longitude/accuracy fix and its
recorded/received timestamps. It is not a location history table. Explicit stop
and terminal delivery transitions remove the current row.

The production launcher `python -m app.start` runs `app.migrate.migrate()` before
starting Uvicorn; `Base.metadata.create_all()` creates missing tables and the
migration checks existing metadata. The FastAPI lifespan only calls
`create_all()` outside production. Production rollout must therefore use the
launcher and confirm the schema exists before accepting rider-location requests.
Do not treat `create_all()` as an ALTER migration for existing tables.

The current auth recovery increment adds `password_reset_tokens`, keyed by a
SHA-256 token digest with a customer foreign key, creation/expiry timestamps and
an optional used timestamp. It stores no raw reset token. The production launcher
also creates this additive table before serving requests; verify its presence and
backup/rollback behavior in staging before enabling password recovery.

## Safety and retention

- Do not add location history or extend retention without an approved privacy
  purpose, retention period and deletion policy.
- A production rollout needs a verified backup and rollback plan. App rollback
  alone does not remove a newly created table.
- No production database was migrated or queried as part of this review.
- Future schema changes need versioned forward/rollback steps consistent with
  the [implementation ledger](../SUPER_APP_IMPLEMENTATION.md).
