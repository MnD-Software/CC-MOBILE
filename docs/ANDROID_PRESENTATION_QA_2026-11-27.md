# Mobile presentation polish — 27 November 2026

## Changes

- Shared headers use balanced navigation/brand, centred DIY and actions, with the title on its own full-width row. On phones below 400dp, the duplicate account shortcut is omitted from browsing headers; Profile remains in the bottom navigation. Search still has a dedicated bag action.
- DIY uses compact tabs and a 132dp live 3D stage on narrow phones. The fixed footer contains Save sketch and Next step; saving turns the action green. Options scroll independently from the preview and footer. New continues to preserve earlier saved designs.
- White cards sit on a warmer, darker neutral canvas. Stronger neutral borders, directional reflections and soft elevation give cards visible edges. Android avoids per-card blur passes; supported iOS retains the existing native Liquid Glass integration through Expo. No additional Swift module or dependency upgrade was required.
- Glass tints are sufficiently opaque to protect text contrast. Dark appearance, increased contrast and reduced transparency retain their existing handling. The colour tests include approximate warm-display shifts; these are not a substitute for calibrated iPhone display checks.
- Empty API GET responses now raise a recoverable EMPTY_RESPONSE error, rather than returning undefined to React Query. Empty arrays remain valid, and mutation HTTP 204 responses remain supported.

## Verified

- Connected Samsung SM-G991N in Expo Go 58.0.5: 1080×2400 physical pixels, 360×800 logical viewport, default font scale.
- Home header fits; DIY remains centred; catalogue and Home carousel load from the review backend.
- Opened DIY, selected an actual cake, reached Finish, saved a sketch and observed the green Sketch saved action in the visible fixed footer. The branded live 3D model remains visible while choosing options. No order or payment was submitted.
- Native screenshots are local, ignored artifacts under artifacts/local-preview/android-\*.png; they are not committed because they include account UI.
- The phone initially showed cached content and an undefined query error. The catalogue endpoint subsequently returned valid data. Reopening the fresh experience inside the existing Expo Go process briefly produced an ExpoCrypto registration error; closing and reopening Expo Go resolved it without clearing account data or changing dependencies. Do not describe this as an application cryptography fix.
- Browser checks passed on six routes at 320 and 430px (12 header checks): one centred DIY shortcut, no horizontal page overflow, one search loader, and inspiration upload accessible without scrolling. The first Chrome run timed out; the fallback run with GPU disabled passed.
- TypeScript passed; all 304 frontend tests passed; production web export passed. Existing contrast tests cover light/dark text, filled actions, increased contrast and approximate warm colour shifts.

## Delivery boundary

The preview server remains running. The latest tunnel address is in artifacts/local-preview/EXPO-GO-REVIEW-URL.txt; older links may refer to an expired session. A temporary USB reverse mapping for port 8084 was used during connection diagnosis.

Physical iPhone checks and Apple signing remain outstanding until the authorised Apple account is available. These source changes do not update an already installed APK. No claim of a new Render deployment or new native build is made by this report.
