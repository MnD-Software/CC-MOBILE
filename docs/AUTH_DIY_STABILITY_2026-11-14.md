# Login, account switching and fresh DIY sketches - 14 November 2026

## User request and scope

Fix crashes reported when signing in and changing to another account; require customer sign-in/sign-up before app entry; simplify authentication; allow a fresh DIY sketch after a creation is complete. No new live payment, Odoo or AI configuration is part of this change. Credentials remain in private local configuration.

## Findings and changes

- Root department guard previously redirected staff away from the sign-in screen at the same moment the authentication form routed them after login. Guards now wait for a mounted root navigator. Public authentication routes defer the post-login redirect to one auth form effect; sign-up uses that same effect. Prevent repeated form submission with a synchronous ref rather than relying only on a later state update.
- Customer tabs now redirect unauthenticated users before mounting any tab content. Corporate clients go directly to their portal, while other staff go to their department workspace. Terms, privacy and password recovery stay publicly available.
- Persisted device preferences previously merged unchecked into the store. Null arrays/maps and broken saved designs could throw when Profile or DIY read them after login. Validate every persisted field, preserving valid saved creations, avatars and history while dropping malformed entries. Existing store actions cannot be overwritten by persisted data.
- Biometric preference state now includes its account owner. A previous member's enabled/ready values are never reused while the next member's settings load; late reads are ignored after account changes. Failed secure-storage reads retain a protected unlock path. A server-verified password sign-in counts as a fresh unlock; auto-restored sessions still use their saved biometric preference. Logout clears the in-memory unlock for that member. Password-fallback logout errors are caught and shown instead of becoming unhandled rejections.
- Non-rider login no longer asks the native location manager about a background task when no rider grant exists. Existing rider-sharing shutdown/revocation remains in place when a grant exists.
- Sign-in/sign-up now have a compact two-tab switch, inline eye control, autofill metadata, disabled duplicate submits and a collapsed optional phone field. Secure refresh-token auto-login remains in force; no passwords are stored by app code.
- DIY has a visible New sketch action while editing. It saves an unsaved creation, clears selections/message/search/quote/completed steps and starts at Flavour with a new UUID. Saving the same cake and size twice as different sketches preserves both. Restoring an existing design retains its ID so edits update that sketch. Adding a design to the bag saves it and resets the editor for next time. Editor state is keyed to the account; quote responses are ignored if selections have changed.
- Global customer celebration/inbox observers are keyed by account so dismissed notifications and pending celebrations cannot carry over during a switch.

## Validation and limits

Focused regression tests exercise malformed preference restoration, public versus protected routes, root-navigation readiness, staff-login redirect ownership, separate sketches with identical cakes, and delayed biometric reads across accounts. Existing token storage/refresh/logout race tests also run.

The available historical logs contain older image-render and Metro errors, but no current physical-phone crash trace proving a single native crash root cause. These fixes address identified transition faults and are not a claim that every possible native crash has been eliminated. Final suite/export/browser results are appended after completion. Physical Expo Go testing of customer -> sign out -> dispatch/production -> sign out -> customer is still required.

A biometric prompt that finishes after an account switch can no longer unlock or alter the new account's gate. Its completion/error callbacks check the original account owner; switching resets its transient busy state.


## Final verification

- Full frontend suite: 243 passed. Final focused authentication/privacy/navigation checks: 21 passed; the six dedicated stability regressions also pass, including a biometric prompt resolving after an account switch.
- Added a browser-review configuration regression: web review has no Expo Go `hostUri` and previously threw during module loading, outside the screen error boundary. It now uses the exact current browser origin plus the isolated proxy path. Production ignores the development flag. Review configuration plus stability tests: 10 passed.
- TypeScript: passed. iOS bundle export: passed (`artifacts/local-preview/auth-stability-ios`); final post-review-configuration export is checked separately below.
- Actual local Chrome mobile-viewport check passed: guest Shop access redirected to sign-in, customer logged in, Profile sign-out returned to sign-in, a different staff account logged in and reached `/workspace`, with zero captured browser exceptions. The report and screenshot are private local artifacts (`auth-browser-result.json`, `auth-staff-switch.png`).
- Local preview setup detail: Expo's `--localhost` server bound IPv6 `::1`, so `http://localhost:8096` was the correct temporary validation URL; `127.0.0.1:8096` refused the connection. This was a validation setup issue, not a failing customer login.
- Physical iPhone/Expo Go acceptance still needs the same account-switch sequence; no native device was connected for this check. No real charges, customer registrations, rider tasks or stock changes were made by these checks.

Final post-configuration TypeScript check and iOS export both passed (`artifacts/local-preview/auth-release-ios`). Temporary validation web server stopped after completion; isolated local backend retained.
