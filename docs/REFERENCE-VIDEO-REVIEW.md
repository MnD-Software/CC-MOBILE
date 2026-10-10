# Carrefour reference review - 10 October 2026

Reference: the owner's 55.76-second screen recording, `WhatsApp Video 2026-10-10 at 09.21.20.mp4`.
This is a visual review of the recorded interactions, not verification of Carrefour's backend.

| Time | Observed experience | Cake City implication |
| --- | --- | --- |
| 0-3s | Logo launch followed by a skippable full-screen campaign | Our short logo entrance exists. A scheduled, frequency-capped campaign takeover is a separate future feature. It must never delay shopping. |
| 3-9s | Scheduled, Express and Instore choices; visible location and slot; persistent search and department navigation | Put delivery or branch pickup context near search. Only show Express when branch stock, preparation time and delivery capacity confirm eligibility. |
| 9-21s | Horizontal campaign artwork, top categories and promotional collections | Our scheduled story infrastructure exists in 0.2.8. Richer home layouts with wide artwork and linked product rows still need implementation and real published campaigns. Preserve the approved Find your flavour design. |
| 24s | Buy Again opens a clearly illustrated empty state | Add a prominent purchase-history shortcut. Reorders must resolve current variations, stock and prices before adding items. An API helper alone is not a finished customer journey. |
| 30-36s | Skeleton loading followed by a visually themed department with recommendations | Use consistent skeletons and Cake City collection art for birthdays, gifting and signature cakes. Do not label ordinary catalogue rows as personalized recommendations. |
| 39-51s | Banner and product-row sections, verified-looking sale labels, vouchers and expiry information | Add configurable campaign sections backed by the content service. WooCommerce must validate discounts and coupons; campaign text cannot create an offer. |

## Verified gaps and release boundary

On 10 October the live API health identified `club-shop-2026-10-08`; `/v1/content`
returned 404. The new story service therefore was not deployed at review time.
Deploying the code alone does not populate it: staff must publish real artwork,
product links, dates and terms. See `EDITORIAL-EXPERIENCE.md`.

The customer Notifications route currently displays an unavailable screen.
A working inbox, read/unread states, customer consent and actual event delivery
remain unfinished. The video does not demonstrate notification delivery.

Existing 0.2.8 additions include the celebration planner, product gallery,
optional clips, saved celebration dashboard, scheduled stories, staff publishing
tools and action feedback. They must be described separately from production
activation and physical-device testing.

## Recommended next delivery order

1. Activate the new backend and publish actual Cake City campaigns. Validate a
   story through product selection, bag and checkout on both native platforms.
2. Add wide campaign sections with linked product rails and a more discoverable
   planner entry. Keep the homepage product-first and the approved categories.
3. Complete Buy Again and the notification inbox as end-to-end journeys.
4. Bring delivery/pickup context into the header using server-confirmed branches,
   stock, fees and slots, then add opt-in celebration reminders.
5. Add a dismissible launch campaign only after the shopping journeys are stable.

Avoid copying the floating promotional overlay: in this recording it covers
categories and products. Cake City should give offers space within the feed.
Neither the video nor a successful build establishes production request capacity;
load testing, database measurements and an appropriately sized hosting plan are
separate work.
