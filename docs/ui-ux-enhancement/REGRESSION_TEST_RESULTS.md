# Regression verification

Current verification and exact results are maintained in [TEST_RESULTS.md](../enhancements/TEST_RESULTS.md) and [live tracking](../LIVE_ORDER_TRACKING.md). Local browser artifacts are under ignored `artifacts/local-preview/` and are not production evidence.

The local browser verifier exercises kitchen assignment, driver allocation, rider acceptance/collection/transit, synthetic GPS map movement, proof-of-delivery, customer completion, notification links, review persistence and pickup handover. The dashboard option exercises the real HTML forms and checks that allocation reaches the assigned rider API.

Tests use the isolated local preview database and no-charge orders. No real payment, hosted database migration or paid AI activation is performed.
