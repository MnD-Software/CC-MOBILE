# Design system

**12 November correction:** preserve the Shop category sidebar and adjacent product grid. The full-width Shop arrangement below is superseded by [the owner's restored layout](SHOP_DIRECTION_2026-11-12.md).

Use existing `src/theme/tokens.ts`, semantic theme colours and `Typography.tsx`; preserve licensed owner fonts and catalogue photography. Spacing uses 4/8/12/16/24/32/48 tokens. Added `shadow.subtle` (Android elevation 1; low-opacity iOS shadow) for catalogue cards; existing card/floating levels remain for stronger interaction hierarchy. Dark-mode colours continue through ThemeProvider.

Shop has a full-width two-column grid, 24-pixel row separation and larger wrapping product names. Long names grow naturally instead of clipping. The existing category/filter/sort sheets remain authoritative controls. Selected category appears in the category control; a redundant single-option subcategory row is hidden.

Shared buttons use minimum height, vertical padding and centred wrapping labels. Navigation retains safe-area and reduced-motion behavior; Club has its pink face only when selected. The accepted plum/berry concierge hero is reused for order tracking, with receipt/details disclosed below the journey.
