# Cake City mobile completeness and review upgrade

Started 13 November 2026, Africa/Nairobi. Continue from the current git diff and this checklist if execution is interrupted. The owner explicitly requested this follow-up after the department ecosystem.

## Accepted scope and implementation decisions

- Every mobile staff module must open a native module, never redirect to the web console. Web remains a separate authenticated interface using the same APIs. Reuse working native editing screens where possible and build missing catalogue, promotion, payment, Club, order, delivery and staff management tools.
- For the isolated local review, any enabled product can be ordered without collecting money. Preserve actual product prices and order totals, with zero due for collection during review. Customer-facing copy follows the ordinary order journey without simulation banners. Internally record review orders distinctly, never count them as real revenue, never call a payment provider and never expose a production payment bypass. Production checkout remains unchanged until explicitly configured later.
- In local review only, advance a Club milestone after each three completed review purchases. Keep production loyalty rules intact. Trigger the ordinary card/message/confetti lifecycle once per qualifying purchase and respect reduced motion.
- Upgrade confetti, Club layout, Build a happy moment, order filters, common old disclosure/filter patterns, customer profile image rendering and the Home account avatar. Keep accepted Shop category/sidebar direction.
- Default catalogue starts with cakes in ascending price order. Separate Accessories with party items/candles/etc. Consolidate Offers into Deals & Steals without deleting underlying products or history. Home search needs a cancel action.
- Improve mobile/web operational presentation. Dispatch can provision rider-only accounts within its authorized scope; riders see/accept only their assigned tasks, cake details, recipients, destination and delivery instructions. Preserve audited assignments, readiness and proof checks.
- Provision the owner's requested dispatch login in the isolated local review only, hashing its password. Never commit credentials or apply weak/shared credentials to production. Private access details stay in ignored review artifacts.
- Odoo and AI remain paused. No real payment, email or remote push test is authorized. Provider configuration and actual device/browser acceptance remain distinct from passing code tests.

## Working map

Staff native: `src/features/staff/`, `app/workspace.tsx`; backend overview `backend/app/staff_workspace.py`. Existing web console: `backend/app/dashboard/`. Review isolation: `backend/app/local_preview.py`, `scripts/local-preview.cjs`, `scripts/start-go-review.cjs`. Payment/reconciliation: `backend/app/app_commerce.py`, `routes_pesapal.py`, `payment_test.py`. Customer UI: `src/features/commerce/` and `src/features/account/`.

## Checklist

- [x] Document approach before implementation and read exact Expo 57 docs.
- [x] Audit and implement native staff module completeness.
- [x] Add scoped rider provisioning and complete rider assignment details.
- [x] Add isolated all-product no-charge review checkout and accelerated loyalty.
- [x] Upgrade customer Club/confetti/filters/search/profile/moment presentation.
- [x] Implement cake-first price sorting, Accessories category, and offer naming consolidation.
- [x] Improve web dashboard presentation without disconnecting it from actual APIs.
- [x] Verify permission/payment boundaries and regressions; update exact checks and remaining limits.
- [ ] Push intended files and verify GitHub state. Do not claim Render deployed without evidence.

## Current progress

Implemented native catalogue editing/image upload/category chips, promotions, order/payment details with tracking, member balances, exceptions, delivery/HQ/pickup stores and checkout-policy editors, rider provisioning, campaign reading, team/audit records and the existing enquiry/quotation flow. Writable Campaign Studio, kitchen, dispatch and rider workspaces retain their native routes. Staff web-console fallbacks are removed; API permissions remain authoritative.

Web adds rider provisioning, segmented data-view controls, authorized queue counts, status cards, clearer KPI hierarchy and responsive styling. Review mode never fabricates live sales. Customer UI adds filter/tool sheets, search cancellation, persistent profile image data rendered in the shared Home avatar, an animated celebration-builder hero, a Club tier map and three-purchase progress, and 136 staggered confetti particles. Reduced-motion behavior remains supported.

`review_checkout.py` is mounted exclusively by `local_preview.create_app`. Production `app.main` has no review checkout route. Every review request checks development settings, the exact isolated SQLite path and media origin, with live integrations disabled. Current catalogue quotes/totals, stock, coupon validation, ownership and idempotency stay authoritative. Internally these are `app_test` / sandbox orders with `review_checkout`, KES 0 collected and ordinary APP references/customer copy. They create no SalesRecord and never invoke Pesapal. Accelerated Club qualifying values apply to review purchases only, unlocking tiers at counts 3, 6 and 9; they must never be used as sales revenue.

The requested dispatch login was provisioned only in ignored local review credentials and the review DB, with a hashed database password. Private role logins are in `artifacts/local-preview/LOGIN.txt`; no passwords belong in this document or git. Customer login is for buying; staff intentionally land in their own department. New riders require unique emails and passwords of eight or more characters. Dispatch creates only rider-role accounts and copies its operational scopes; existing accounts cannot be overwritten or promoted.

Preserve unrelated untracked APK and WooCommerce directories. Existing local backend may be running on 8010 and must be restarted to load new routes. Do not erase the review database or stop an unknown listener.

## Review sequence

1. Stop the old preview normally in its terminal and restart `npm run start:go:tunnel` so both API routes and the review flag reload. No mobile staff module redirects to the console.
2. With the private customer account, order any available catalogue cake at its real quoted value and KES 0 due. Repeat three purchases to unlock the next Club milestone/card prompt.
3. Kitchen assigns production, starts preparing, then marks ready. Customer Orders and the inbox update.
4. Dispatch creates a rider from Rider accounts and assigns the order. The rider uses their own login to accept, collect after readiness, start delivery, read cake/message/destination/contact/instructions, then complete with proof.
5. Customer confirms receipt, then rates the experience or returns later. Customer satisfaction is available to admin/staff/ecommerce manager/customer service on mobile and web.
6. The web console is `http://localhost:8010/dashboard/` when the local backend runs. Select Review orders for review workload; live sales remain independent.
7. Manually inspect small/large phones, larger text, light/dark mode and reduced motion. Check sheet scrolling/dismissal, avatar upload, all role modules, Club prompts, confetti, GPS and notification permissions. These are device acceptance checks, not claims established by unit tests.

## Verification evidence

- `npm test`: 216 passed after customer/native module/web improvements. Includes search cancellation, accessible sheet expansion, live checkout boundaries, review capability gating, segmented web controls and queue counts.
- `npm run typecheck`: passed after native modules and UI integration.
- From `backend/`, `python -m pytest tests/test_review_checkout.py tests/test_logistics.py tests/test_staff_workspace.py -q`: 39 passed. Covers 3/6/9 milestones, full-price/zero-charge orders, stock, idempotency, ownership, cake/accessory sorting, rider provisioning/acceptance and department permissions.
- Review end-to-end API test: passed for order -> kitchen -> dispatch -> rider -> delivery -> customer inbox, with no provider calls, remote push jobs or live sales records.
- Payment/dashboard/catalogue/search/notification/Club regression selection: 62 passed.
- iOS production JS/Hermes export succeeded to ignored `artifacts/local-preview/upgrade-ios`; this proves bundling, not device behavior or an installable App Store build.
- Final receipt/satisfaction API selection: 19 passed (`test_notifications.py`, `test_review_checkout.py`, `test_home_orders.py`, `test_order_experience.py`). Covers owner-only receipt, idempotent confirmation, one satisfaction inbox reminder, receipt required before rating, duplicate review protection, staff feedback permissions and the review delivery flow with cake message/instructions intact.
- Frontend suite rerun after receipt integration: 216 passed; new receipt-prompt renderer test plus web dashboard tests: 5 passed. The receipt test confirms rating controls stay hidden until the customer acknowledges receipt. Typecheck and dashboard JavaScript syntax checks passed.

## Operational limits

Phone/browser visuals, actual GPS, phone notification permissions, remote push delivery and Render deployment have not been verified here. Only Pesapal was previously reported configured on Render; SMTP and remote push are not established. Local review deliberately disables external providers, while in-app notification records are exercised by API tests. Odoo, AI and real payment activation remain paused.

Earlier separate web-preview launch was rejected by automatic approval review; no browser visual acceptance is claimed. Product tools create simple products and edit existing imported variations, retaining revision/stock validation. No live records were changed. A documentation shell command was also rejected; this handoff was updated through the file-editing tool.

## Customer receipt and satisfaction follow-up

The owner additionally requested explicit customer acknowledgement of delivery, followed by satisfaction feedback. Implemented using existing receipt acknowledgements and private order reviews, with no schema migration. Rider delivery remains separate from customer receipt (`received_at`). Confirming receipt opens the order for optional feedback and creates one inbox reminder, so the customer can return later. Feedback requires receipt acknowledgement and remains idempotent; historical existing reviews stay readable. Admin/staff/ecommerce manager/customer service can access Customer satisfaction on mobile and web. Other departments cannot retrieve these private reviews. Order details show whether customer receipt is confirmed.
