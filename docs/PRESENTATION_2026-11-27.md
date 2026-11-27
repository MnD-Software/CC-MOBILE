# Mobile presentation handoff - 27 November 2026

## Scope

Preserve the accepted customer and departmental UI. Prepare Android and iOS builds, hosted no-charge checkout, and one fuller celebration. Odoo and AI remain paused.

## Changes

- Full payment/reward celebrations now contain 5,000 pieces, using one offline canvas inside the existing WebView dependency on phones. Web uses a sandboxed iframe. Side cannons and a broad falling curtain share a nine-second lifetime; compact effects retain 108 native pieces. The effect does not intercept touches, respects existing reduced-motion gates, stops on background, and releases its surface on unmount.
- `HOSTED_TEST_CHECKOUT_ENABLED=true` enables no-charge ordering through the normal `/v1/app-orders` endpoint. The mobile app discovers this through checkout configuration; it needs no public test flag. Current prices, discounts and totals remain visible. The confirmation action explicitly states KES 0 due now.
- Orders retain a separate test channel, no live sales ledger entry, and zero collected on the receipt. Kitchen, dispatch, rider, customer tracking, in-app inbox and three-purchase review milestones use the existing review workflow. External payment submission is blocked while the hosted switch is enabled. Existing review notifications remain in-app; no remote push is claimed by this mode.
- Quotes bind to the checkout mode. Switching modes requires a new quote rather than silently converting a KES 0 request into a live payment. Idempotency, customer ownership, stock and coupon checks remain enforced.
- Odoo must be disabled during hosted testing. Database, authentication and production CORS/rate-limit requirements remain enforced.

## Render setup

The blueprint now declares `HOSTED_TEST_CHECKOUT_ENABLED=true`. For an existing service configured manually, **set that environment variable in Render and redeploy the latest backend commit**; changing a YAML file does not change an existing service automatically. Keep `ENVIRONMENT=production`, the existing persistent database and private JWT/Redis configuration. Keep `ODOO_ENABLED=false` and `ODOO_LOYALTY_AUTHORITY=false`.

Verify `GET /health` returns `status: ok`, then `GET /v1/payments/pesapal/config` returns `test_checkout: true, available: true`. If `catalogue_setup_required` is true, review the existing checkout policy in Admin; this change does not overwrite the operator's pricing or fulfilment settings.

To restore payments, set `HOSTED_TEST_CHECKOUT_ENABLED=false` and redeploy. Existing test orders cannot be charged through Pesapal. Review current Pesapal credentials/policy and submit a newly quoted order for any later live payment test.

## Presentation route

1. Sign in as a customer. Browse the catalogue, save a cake and open DIY. Keep the live cake visible while choosing flavour, size, icing and decoration.
2. Add an order, select pickup/delivery and an available slot, select an eligible coupon, review the total and place with KES 0 due now. Show the celebration, receipt and Club progress.
3. Sign in as production, progress the order through preparation and ready.
4. Sign in as dispatch, assign a rider. The rider accepts, collects and progresses delivery. Demonstrate customer tracking and in-app updates.
5. Customer acknowledges receipt and leaves feedback. Show completed order history.
6. For the staff overview, select **Review orders** to view the test queue; live sales remain separate. Demonstrate corporate and marketing as separate role workspaces without sending real campaigns or payouts.

## Release boundaries

Android requires an APK build containing these changes. iPhone installation requires valid Apple signing/provisioning and distribution; an unsigned IPA or simulator build is not an installable iPhone release. Neither a successful JavaScript export nor an EAS upload proves phone performance. Record actual build results and links below before claiming readiness.

No private credentials belong in this document, source control or mobile build. No live charge, campaign, external message or rider payout was authorised as part of validation.

## Verification results

- Baseline: TypeScript and all 292 frontend tests passed.
- Baseline operational backend pass: 43 tests passed, covering authentication races, purchase cycle, review checkout, logistics, home orders, DIY and categories.
- Hosted checkout/Pesapal/review/production guard pass: 57 tests passed, including new no-charge, idempotency and mode-switch protections. Providers were mocked.
- Targeted frontend pass: 10 tests passed, including canvas lifetime/density, reduced motion and checkout recovery.
- Canvas visual captures at 320 x 568 and 430 x 932 rendered without browser exceptions. These are browser checks, not native phone performance results.
- Final platform export/build status is recorded after completion.
