# UI/UX improvements

The current finishing increment removes the fixed Shop rail, reuses the existing category/filter sheets, enlarges wrapping product titles, introduces subtle catalogue elevation, and corrects the inactive Club tab styling. Orders reuse the accepted concierge visual direction. The concierge entry remains hidden. See [screen improvements](../ui-ux-enhancement/SCREEN_IMPROVEMENTS.md) for the concrete scope and remaining limitations.

## Existing foundations

- Shared theme tokens, reusable commerce components, responsive screen
  structures and accessible controls are already present.
- Current worktree changes include order-journey presentation, live map
  surfaces, foreground-only rider location controls, button wrapping/minimum
  touch sizing, image loading polish and recent-view tracking.
- The Home concierge entry is intentionally hidden in version 0.3.2; its route
  does not imply that paid AI is enabled.

## Next design and accessibility pass

1. Audit representative Home, Shop, Product, Cart, Checkout, Orders and Club
   flows at 320, 375, 390 and 430 CSS-pixel widths.
2. Verify dynamic type/font scaling, contrast, screen-reader labels, keyboard
   dismissal, focus order, minimum touch targets and reduced-motion behavior.
3. Check native safe areas, navigation transitions, haptics, permission
   disclosures and WebView/map rendering on signed iOS and Android builds.
4. Measure image and list performance on a mid-range Android device before
   claiming improvements; use only authoritative catalogue imagery.
5. Keep product, payment, delivery and loyalty facts sourced from validated
   backend responses. Do not add invented ETAs, stock or offers to improve
   visual density.

## Validation boundary

The current JavaScript tests and TypeScript check do not prove native layout,
physical GPS accuracy, background location behavior, App Store compatibility or
screen-reader quality. See [TEST_RESULTS.md](TEST_RESULTS.md).
