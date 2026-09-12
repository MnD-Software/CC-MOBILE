# Master Prompt Recheck

> Historical August assessment. The September native implementation and current
> blockers are tracked in [REBUILD_STATUS.md](REBUILD_STATUS.md) and
> [API_INTEGRATION.md](API_INTEGRATION.md). Do not treat the preview or capability
> statements below as current release evidence.

Rechecked against the 76-section Cake City Production Mobile Commerce & Customer
Platform specification on 2026-08-18.

## What is currently real

- The customer mobile repository uses Expo SDK 57, React Native and strict TypeScript.
- The existing Cake City FastAPI/PostgreSQL platform remains the authority for identity,
  catalogue, carts, checkout, payments, orders and loyalty.
- Email login, rotating mobile refresh tokens and secure device storage are implemented.
- Google identity exchange, provider identity persistence, configuration validation and
  targeted backend tests are implemented; activation still requires real Google client IDs.
- The experience surface reads the public Cake City WooCommerce Store API for current
  product names, prices and imagery.
- EAS development, preview and production profiles and environment-specific API
  configuration exist.

## Isolated experience data

The browser experience includes sample order tracking, reward balances and checkout state
only so stakeholders can review the complete customer journey. Every such surface is marked
`Experience mode`. It cannot create an order, initiate payment, modify loyalty, reserve
inventory or imply a successful server operation.

The product fallback list contains a dated snapshot of real Cake City Store API records and
is used only when the public catalogue cannot be reached. It is not the production mobile
catalogue implementation.

## Requirements not yet complete

- The native Expo application does not yet have feature parity with the browser experience.
- Native catalogue, product detail, server-side search, cart and checkout vertical slices
  still need to be connected to the existing FastAPI contracts.
- Product variants, availability, branch inventory, delivery quotations and promotions must
  always come from authoritative APIs before native checkout can be accepted.
- M-Pesa and card UI must not be enabled until the existing server providers and callbacks
  are configured and verified in the deployment environment.
- Native orders, WebSocket/polling tracking, notifications, location, rewards, celebrations,
  favourites, reviews, custom-cake uploads, corporate ordering and support remain future
  vertical slices.
- Android and iOS build acceptance is outstanding. Metro currently stalls against the
  OneDrive-backed dependency tree and requires a clean local dependency installation.
- Admin, kitchen and dispatch remain in the existing Cake City platform; they must not be
  exposed to guest customers.

## UX corrections from the recheck

- Desktop preview now uses a roomy full-width shell instead of a small simulated phone.
- Mobile keeps a persistent five-tab navigation: Home, Shop, Orders, Rewards and Account.
- Unicode and emoji navigation symbols were replaced with a single reusable outline-SVG
  icon system for consistent weight, alignment, accessibility and scaling.
- Guest access can inspect all customer modules, but sensitive mutations remain explicitly
  simulated and labelled.
- Live catalogue products are visually distinguished from experience-only operational data.

## Next production vertical slice

Implement native catalogue browsing end to end:

1. typed catalogue API client and schemas;
2. TanStack Query pagination and caching;
3. Expo Image responsive loading;
4. search and filters through server parameters;
5. product detail with authoritative variants and availability;
6. loading, empty, offline and actionable error states;
7. component, API-contract and navigation tests;
8. Android development-build verification from a clean local dependency tree.

No later module should be called complete until its UI, API, database authority,
validation, error handling, tests, observability and documentation all exist.
