# Club celebrations and refreshed splash

The independent Club now persists one first-points achievement and one achievement
per earned Gold, Diamond and Platinum threshold. Achievements originate in the
verified loyalty ledger transaction. First points means the first positive points
actually credited; failed, pending or fully refunded first purchases do not consume
that prompt. Historical positive earners are not welcomed as first-time earners.

The customer sees confetti and a **Reveal my Club card** prompt for first points.
Each tier has its own **View new card** prompt. Earned prompts follow the account
between checkout, orders and Club, remain pending until acknowledged and cannot be
acknowledged by another member. Tier jumps queue each crossed tier. Once acknowledged,
refreshes, another device, refunds and requalification cannot award that milestone
again. Payment celebration remains separate: one confetti burst per verified order
on that installation, with a reduced-motion alternative. The payment animation now
waits for the accessibility preference to resolve before deciding whether to run.

The Club page retains the member card and barcode, then shows a reward progress
panel and a milestone map with exact qualifying-spend requirements. Existing earning,
redemption, expiry and refund rules are unchanged. This is a visual progression
system; no prize, discount, coupon or extra points are invented by the UI.

`GET /v1/club` adds `celebrations` and `journey`. The optional fields preserve older
backend compatibility. `POST /v1/club/celebrations/{id}/ack` records acknowledgement.
The current Odoo addon does not supply durable first-points events: if Odoo loyalty
authority is enabled later, its custom adapter needs the same event contract for
that behavior; the existing tier-change observer remains the fallback.

The revised splash replaces the ivory treatment with deep berry, electric cyan,
editorial lettering and a bundled generated cake visual. The original logo remains
unchanged. The cake visual is decorative artwork, not an advertised catalogue item.
Native launch uses the matching berry background. The in-app welcome is brief and
has a reduced-motion alternative. Native splash changes require a new binary.
The development-only artwork preview remains `/splash-preview`.

Local validation uses the isolated database and a fresh, private QA reviewer,
without clearing or changing existing customer balances. No real payment is made.
GitHub/Render delivery does not build or install a new Android/iOS app or configure
FCM/APNs credentials; see [NOTIFICATIONS.md](NOTIFICATIONS.md) for those steps.

Validation on 10 November 2026: 175 frontend regression tests plus the new payment
confetti accessibility regression test passed; 44 targeted backend tests passed,
followed by the final 4 achievement tests after milestone queue ordering was made
explicit. TypeScript and formatting passed. The local browser/API check used fresh
reviewer `Club Reviewer`, completed test order `APP-TEST-20261110-0F12F0BAFFBD43C4`,
observed confetti and first-points prompt, acknowledged it, revealed the card with
one point and checked Club at 320px, 390px and 1280px. Revised splash artwork passed
320×568, 390×844, 430×932 and 1280×900 checks with no overflow. Evidence remains in
ignored `artifacts/local-preview/club-and-splash-verification.json`; no credentials
or local review databases are included in source delivery.
