# Live DIY preview and Android surface refinement - 16 November 2026

## Request and approach

Restore the cake itself as the focus while preserving the easier browsing and fixed Next actions from the previous update. Use the live procedural 3D model by default, keep it pinned above the scrolling options, and keep the bakery photo as an optional reference. Avoid a second WebGL scene while enlarging the editor.

## Implementation

- `CakeStage.tsx`: 3D is the default even when a photograph exists. The inline scene stays visible during flavour/size/icing/decoration selection. Camera and expand controls open the photo/reference and larger editor. GPU failure falls back to the bakery photo; no broken return-to-3D button is shown after a failed renderer. Colour, message, size and extras continue streaming to the existing scene without remounting it on each option change.
- Inline canvas heights: 112 px on short screens, 144 px on intermediate screens, 180 px on taller screens. Expanded preview remains available. Decorative motion respects accessibility preferences and screen activity.
- `InventoryStudio.tsx`: short screens use a single-row branded header and compact tab labels. Search stays below DIY/Inspiration; preview and progress remain fixed; products/options scroll; Back/Next/Confirm/Add stay reachable.
- `cake-scene.ts`: wide inline scenes use closer camera framing, with room around the board. Existing Cake City branding stays on the board. This remains an original illustrative model rather than a scan or photorealistic product model.
- `GlassSurface.tsx`: Android surfaces use lightweight static gradients, upper edge highlights and soft elevation. The floating dock keeps its existing supported blur target and gets the same finish. Product rows marked opaque stay solid; high-contrast and reduced-transparency paths retain their solid appearance. iOS native Liquid Glass is preserved. No new native dependency was added.

## Validation

- TypeScript passed; all 290 frontend tests passed.
- Four new regression cases cover 3D-first/photo selection and live configuration, a single mounted renderer when expanding, GPU/photo fallback, and nonblocking Android gloss with solid accessibility/opaque surfaces.
- Browser checks on a copied validation database passed at 320 x 568, 390 x 844 and 430 x 844. The smallest screen retained 123 px of scrolling options and a reachable fixed footer. The selected cake remained visible while finish/size options were on screen. The preview remained fixed while the product list scrolled; no horizontal page overflow was detected.
- Android styling branches were checked in component tests. Native Android appearance, GPU performance and touch feel still require phone verification; browser screenshots are not Android device proof.
- No payment, campaign, notification or rider payout was sent. Temporary validation servers are separate from the owner's preview.

## Build boundary

The previous successful EAS APK is 0.3.4 (26), build dde1bf8f-3ec3-4c78-850b-03905fd934f5. It predates this refinement. This task updates application source; it does not replace the APK automatically. A new Android build or an explicitly published compatible preview update is needed before installed APK users receive this change. No new build or OTA publication has been started for this refinement.

## Completion pass (Claude, 16 November 2026)

- **Overlapping controls fixed** (`CakeStage.tsx`). In the inline preview, switching to the bakery photo drew Codex's "Return to live 3D cake" and Enlarge buttons in the same top-right corner as the photo view's own "Hold to compare" and "Reset" buttons, so they sat on top of each other once additions existed. Those two buttons now go through `RealCakeView`'s `extraControls`, so all four sit in one row on short stages and one column otherwise. A failed renderer still hides "Return to live 3D cake".
- **Test helper**: `tests/studio-live-preview.test.cjs` now also searches `extraControls`.
- **Validation**:
  - TypeScript passed; 290/290 frontend tests passed.
  - Browser check on a copied validation database (`artifacts/local-preview/codex-browser.cjs`, ignored; API on :8911 and web on :8097, both stopped afterwards; the owner's :8010 and :8084 were untouched). At 390x844 and 320x568:
    - The inline preview mounts one 3D scene.
    - The photo view with candles and a message shows Hold/Reset/Return/Enlarge with no overlapping buttons.
    - Enlarging still uses a single scene (one iframe), with no horizontal overflow and 0 runtime exceptions.
  - Screenshots: `artifacts/local-preview/codex-*.png`.
- **Build boundary is unchanged**: installed APK 0.3.4 (26) users need a new build or a compatible update to receive this.

## Owner follow-ups (16 November 2026)

- **Real cake option removed**: the DIY stage is live 3D only. The Real cake tab, camera button and drag-to-place editor are gone. If WebGL fails, a plain product photo is shown (not selectable). New designs and orders no longer carry `design_placement`; the backend still accepts it, and the kitchen card shows a layout only for older orders that have one.
- **Scissors on the inline preview**: "Show inside layers" sits beside Enlarge both inline and enlarged. On the 112 px stage the buttons sit in a row.
- **Steady order-tracking button**: `TrackOrderAction` no longer has a pulsing halo; the dot is steady and the arrow keeps its gentle nudge.
- **Closable Home tracking card**: an × on `ActiveOrderCard` hides that order's card. The choice is stored per account in `hiddenTrackingByOwner` (validated on restore), a toast points to Orders, and a new order shows a card again.
- **Validation**:
  - TypeScript passed; 292/292 frontend tests passed.
  - Browser check on a copied database, 3D-only stage at 390 and 320 px: only Scissors/Enlarge, no overlap, no "Real cake" text.
  - Browser check of the tracking card: × hides it; the order is still listed in Orders; it stays hidden after returning to Home.
  - 0 runtime exceptions. Not yet checked on a phone.
