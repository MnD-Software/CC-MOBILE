# Shopping refinement — 28 September 2026

This is a focused shopping/navigation update, not completion of every requested app feature.

## Implemented

- Restored the image-led, 238px Home carousel with cocoa overlay and white product copy.
- Added a single sliding glass tab indicator with reduced-motion handling. Navigation is Home, Shop, Club, Orders, You; Club has a solid brand-colour centre button. Search remains accessible in the header.
- Matched the supplied Oraimo layout structure: top collection tabs, narrow category sidebar, editorial banner and vertical product rows. Cake City branding is retained.
- Collection order starts Signature, Menu cakes, Chocolate sponge, Pound cakes. Menu cakes is a presentation grouping of verified live category IDs, not an invented server category.
- Added server-ordered, paginated lowest-price-first browsing and validated minimum/maximum KSh budgets. The deployed mobile proxy does not forward these filters, so this read-only browsing path uses the public WooCommerce Store API. It never substitutes an unsorted cached page.
- Every product tile has a 44px bag action. Variable cakes open their size/options; only purchasable, in-stock simple products use quick-add. Out-of-stock actions are visibly disabled.
- Strengthened white product surfaces and contrast. Shop rows use opaque white surfaces without per-cell blur; photographs have loading/error placeholders. Replaced Home's Saved cakes shortcut with Cake concierge/help; existing saved data is preserved.

## Checks

- TypeScript, 53 automated tests, and production release-configuration checks passed.
- Web export: `artifacts/shop-refinement/export`.
- Layout and budget-flow browser evidence: `artifacts/shop-refinement/accepted/result.json` (eight screenshots, no unhandled exceptions). The run uses the explicitly enabled read-only public-catalogue transport bridge described below; it is not an unmodified web-production test or proof of native glass.
- No commit, push, EAS build, deployment, payment or authenticated order was submitted.

## Still outstanding

- Full app dark mode is not implemented in this pass.
- Unmodified localhost web browsing is blocked by Cake City's current CORS policy on the direct Store API. Native requests do not use browser CORS. The visual QA bridge proxies only public product/category GETs in the test runner, never account/cart/order data. Production web support requires approved origin configuration or deployment of a sorting/budget-aware mobile proxy.
- Club's centre button opens the existing Club page, but verified balances, benefits and redemption are unavailable: the deployed API exposes no corresponding account endpoints. Navigation is functional; rewards are not.
- Order tracking remains limited to up to 12 account-scoped checkout records saved on this device. Website/other-device orders need secure receipt recovery or a real account-order endpoint. No courier location tracking is available. This audit did not fix that limitation.
- Native iPhone review is still required for glass motion, safe areas and keyboard behaviour. This export is not an installable iPhone app.
