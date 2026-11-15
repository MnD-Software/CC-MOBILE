# Customer experience and operational follow-through

## Owner request

Implement the ten recommendations from the conversation and correct Club tier appearance: opting into card colours should theme the entire Club page, including Gold backgrounds and content surfaces, rather than a nearly invisible tint. Preserve the opt-out, readability, accepted Shop/checkout layout and account isolation. Odoo and AI remain paused; review checkout remains isolated from live payment.

## Approach and continuation checklist

Build on existing celebrations, coupons, company quotes, service desk and native/web workspaces. Do not create a second payment, pricing or order ledger. All ordering shortcuts prepare a bag for customer review using current inventory. Delivery capacity must be checked atomically when an order reserves stock, not merely advertised in the UI. Any new database tables must be registered for normal migration.

- [x] Full-page tier theme, including light/dark readable surfaces, header and controls.
- [x] Current-inventory reorder and corporate repeat-order shortcuts.
- [x] Celebration planning and editable discovery preferences with surfaced recommendations.
- [x] Gift checkout, recipient details and price-free delivery information.
- [x] Next achievable reward and contextual coupon discovery.
- [x] Staff-configured delivery/pickup slots with capacity reservation/release.
- [x] Low-rating customer-care cases with ownership, deadlines and customer-visible status.
- [x] Promotion results based on orders and verified net sales; distinguish review activity.
- [x] Staff operational exception list for stalled/unassigned work and overdue care.
- [x] Native and web access, automated permission/concurrency/ownership checks, visual/type/build validation; delivery evidence below.

## Operational boundaries

No invented delivery capacity, automatic live discount issuance, live charges, refunds or rider transfers. Empty slot configuration must remain explicit and compatible with existing checkout until configured by staff. Existing production services, legal/tax activation, phone push delivery and native GPS/biometric acceptance remain separate operational setup. Record actual implementation and any limitations below as work progresses.

## Implemented behaviour

Home has a compact doorway to `/for-you`, with Discover, My usual, Plan and Care tabs. Preferences are account-owned, editable and opt-out; discovery filters real whole cakes by selected flavour and budget. The existing celebration calendar, builder and reminder controls are reused. Customer order details offer reorder. Reorder checks current enabled stock/prices, prepares a reviewable bag, clears occasion messages and extras, and never orders or charges. Checkout still validates size/variation and configured pricing.

Company quotations can be saved as shared company favourites and repeated at current prices through the existing quote approval lifecycle. Native and web portals expose both actions. Company invoices/statements and approval/payment evidence remain on the existing ledger.

Gift checkout supports recipient, message and a price-free note. The buyer retains their full receipt. The note is owner-authenticated, escapes user text, embeds the real logo and contains no prices or purchaser billing contacts. Dispatch sees gift handling instructions.

`ClubPageTheme` scopes semantic colours to Club, with visible metallic backgrounds and matching panels, header and controls. Tier names are case-insensitive. New preferences default to following the card; existing opt-outs remain respected. High contrast keeps the standard accessible palette. Gold is visibly gold, rather than a 6% tint. The existing earned card, milestones, coupons and confetti remain. A compact next-reward progress card complements the next-tier goal.

`Service & growth` is available in the native and web staff workspaces with role-filtered attention, care, slots and promotion-result views. Poor overall ratings or late/damaged/low-rated delivery feedback create one order-linked care case; existing assigned service agent is retained, otherwise an available care agent is assigned when present. Unassigned cases remain in the care queue for claiming. Responses are customer-visible and revision-checked, and generate inbox updates. Response target is 24 hours; escalation is visible in the attention queue. Automatic refunding is not implemented.

Operational exceptions show unassigned kitchen work after 15 minutes, ready orders awaiting a rider, active trips without an update for 60 minutes, missed booked windows and overdue care responses. Department/agent scopes apply. These are internal thresholds, not promised customer arrival times. They refresh on screen; there is no new background paging/telephony provider.

Coupon outcome reporting counts coupon-attributed app orders, first-time/returning buyers and verified net KES collections including reversals. Review order counts are separate. This is attribution, not an A/B-tested causal lift measurement. Scans are bounded in discovery/attention; production-scale aggregate reporting remains a scaling concern.

## Pickup and slot refinements requested during work

- Remove HQ/Wambugu from native pickup choices and corporate web checkout. Keep HQ as the internal production/route origin. Direct HQ pickup requests are rejected; other branches remain, including the Athi River-to-Embakasi merge.
- Slots cover pickup and delivery, show Full/Booking closed status and disable customer selection when unavailable. When current windows are configured, a valid slot is required; leaving the selection blank cannot bypass capacity.
- A conditional SQL update reserves the last place in the same transaction as order stock/coupon reservation. Quotes do not reserve places. Repeated order requests reuse the existing order. Unpaid cancellation, fulfilment cancellation and payment reversal release reservations idempotently. Paid bookings keep their place through fulfilment.
- Only the existing HQ Dispatch Manager role (`dispatch`, used by the owner's dispatch login) can add capacity to a booked/full window. Admin, ecommerce, production, branch dispatch/managers, riders, call centre and customers cannot override it. The separate native/web Override action requires extra places, current revision and a reason of at least ten characters; every override is audited. Ordinary slot edits cannot bypass it, even for Dispatch Manager. Closed windows cannot be reopened through this override.
- No operational windows are invented or seeded. Administrators/Dispatch Manager create actual dated windows and order capacity. Booked time/label/type cannot be changed; affected orders require staff contact and a separate operational arrangement.
- Tables are additive and imported by `main` and `migrate`; release deployment must run `python -m app.migrate`. Discovery preference export and account closure are included in the existing privacy lifecycle.

## Verification

- Frontend: final full suite **253 passed**. Full/closed windows remain visible and disabled; a blank time preference cannot bypass configured capacity. Contrast is checked for light/dark tier palettes.
- Broader backend: 106 tests passed (payment, logistics, feedback, business, staff, UX, notifications, privacy).
- Final experience/slot tests: 13 passed, including first-purchase classification, current-price reorder, care ownership, favourites/quote approvals, gift-note privacy, last-place capacity, mandatory slot selection and exclusive dispatch override for both fulfilment types.
- Existing stale tests were updated to reflect app-only sales reporting and branch-only pickup; no website records were removed.
- One existing Starlette/AnyIO deprecation warning remains. No live charges, refunds, external messages or rider transfers were performed.
- Local Chrome browser: customer sign-in, personalised-discovery screen and My usual navigation passed, with 320/390/430px no-horizontal-overflow checks. Gold Club screenshots were visually inspected at phone widths: page, header, panels and welcome card follow Gold. Gold was injected into the browser response only for this visual test; the member's real points/tier were not altered. No runtime exceptions. Native phone and Render acceptance are not claimed.
- Discovery cards use a horizontal rail with 220px cards so prices and product actions fit on small phones.
- Local review API must reload to import the additive tables and endpoints. Staff open **Service & growth > Time slots** to publish real capacity. The existing dispatch login uses `dispatch`, the only override-authorised role. No example slots or discounts were created in the owner's data.
- Final post-override backend selection: **44 passed** (`experience-ready-backend.log`), covering experience, logistics, pickup/delivery routing, company workflows and privacy. Final targeted frontend checks: **14 passed**. Final TypeScript and changed-file Prettier checks passed.
- Final iOS Hermes export: `artifacts/local-preview/experience-complete-ios`, `entry-dc49cd835248d07e9f9f1f289d454757.hbc` (6.9 MB). This is a local export, not an installed binary.
- Browser check rerun after the narrow-phone card refinement passed with zero runtime exceptions. Screenshots and logs remain ignored private artifacts.
- Local review backend restarted; health returned 200 and OpenAPI confirms the new experience and dispatch override endpoints. Temporary validation API/web processes are stopped after checks, leaving the updated isolated review backend available.
- Render rollout remains separate: deploy this revision and migrate before exposing the new screens. Real capacity, provider configuration and phone acceptance still need operational verification.
