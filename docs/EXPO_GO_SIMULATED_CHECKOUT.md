# Simulated checkout in Expo Go

The normal `npm run start:go:tunnel` connection uses Render. Production intentionally rejects simulated purchases, even for staff. Expo Go does not override that server rule.

For an isolated no-money walkthrough:

1. Keep `npm run preview:local` running. It uses its separate local database and disables live integrations.
2. In another terminal run `npm run start:go:review`.
3. Scan **that session's QR code** in Expo Go (port 8084), rather than opening the normal production-backed session from history.
4. Sign out if necessary. Sign in with the **admin test account** from the private local file `artifacts/local-preview/LOGIN.txt`. Production account credentials do not belong in the review backend.
5. Open Shop → Test celebration cake. Enter the phone/address, review, then confirm the preview purchase. Follow the resulting order and Club credit. Use the local staff workspaces for kitchen/dispatch progression.

The app and isolated API share the Expo tunnel, so the phone does not need a separate LAN connection to port 8010. Only the explicitly enabled review Metro server exposes the fixed local API proxy. The normal launch strips review settings, and release builds ignore the review tunnel flag.

This creates no real payment or delivery. Keep the computer and both terminal processes running. Remote push and background rider GPS still require an installed native build and their respective setup; this checkout connection does not enable those Expo Go features.
