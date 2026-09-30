# Cake City UI refresh — 0.2.3

## Implemented

- Floating glass navigation with keyboard handling, safe-area spacing and accessible tab labels.
- Native iOS Liquid Glass without the previous opaque default tint; reduced-transparency fallback. Reveal animations no longer pass through zero opacity, which disables native glass.
- Product-led Home, glass hero information, clearer saved-cakes/Studio/branch shortcuts and a compact collection rail. Product and price data still come from Cake City.
- Glass product action panel, larger touch targets, bag/details/payment navigation indicators and calmer account presentation. Profile settings can be collapsed.
- Fixed native sign-in/register text rendering, restored a visible password-reset action and prevented Save for later from toggling an already-saved cake off.
- Fixed guest session restoration cancelling public catalogue requests. Account transitions still remove private query caches and mutations. Legacy token cleanup uses the platform-safe storage adapter on browser logout.
- Expo Widgets Live Activity extension configuration, Lock Screen and Dynamic Island layouts, opt-in order control, explicit server-status mapping, stale-state presentation and terminal-state handling. See [iOS integration limits](ios-live-activities.md).

## Verification

- TypeScript check: passed.
- Automated tests: 50 passed, including in-flight catalogue preservation, private-cache eviction, Live Activity statuses and existing payment safeguards.
- Production release configuration check: passed with the live HTTPS API URL.
- Scoped whitespace diff check: passed.
- Browser smoke check: Home, Shop, product, Orders, guest Account, registration, bag and empty-checkout recovery; six screenshots at phone/tablet widths; zero unhandled exceptions. Evidence: `artifacts/ui-refresh/accepted-screenshots/result.json`.
- iOS JavaScript export and config introspection passed. Config includes `ExpoWidgetsTarget`, its app group and `NSSupportsLiveActivities`. These checks are not a native archive build.

## Not yet verified or released

- No new signed IPA/EAS device build was produced for this UI refresh. The earlier unsigned IPA does not contain these changes.
- Native glass, Dynamic Island and accessibility behavior still need review on an installed, signed iPhone build. Expo Go cannot host the Live Activity extension.
- Live Activities currently use foreground order-screen polling; background APNs updates are not integrated. Old information is marked stale after two minutes.
- No real payment or authenticated customer purchase was submitted during verification. Rewards and other unconnected backend features remain unavailable rather than simulated.
- The previous Expo Go session was disconnected. Restarting Metro from this agent was blocked by execution policy; run `npm run start:go` in the workspace and scan its current QR code. Keep the CLI and Expo Go signed into the same Expo account.

No commit, push, account switch or deployment was performed for this refresh.
