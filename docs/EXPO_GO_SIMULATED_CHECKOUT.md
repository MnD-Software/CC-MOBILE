# Simulated checkout in Expo Go

`npm run start:go:tunnel` starts the isolated test backend and Expo Go tunnel together. Production intentionally rejects simulated purchases, even for staff.

For an isolated no-money walkthrough:

1. Run **`npm run start:go:tunnel`** in one terminal. No separate backend command is needed. It uses its separate local database and disables live integrations.
2. Wait for the Expo QR code. The current QR is also saved automatically to `artifacts/local-preview/EXPO-GO-REVIEW-QR.svg`.
3. Scan **that session's QR code** in Expo Go (port 8084), rather than opening the normal production-backed session from history.
4. Sign out if necessary. Sign in with the **admin test account** from the private local file `artifacts/local-preview/LOGIN.txt`. Production account credentials do not belong in the review backend.
5. Open Shop → Test celebration cake. Enter the phone/address, review, then confirm the preview purchase. Follow the resulting order and Club credit. Use the local staff workspaces for kitchen/dispatch progression.

The app and isolated API share the Expo tunnel, so the phone does not need a separate LAN connection to port 8010. Ctrl+C stops the services this command started. If an isolated backend was already running, it is reused and left running on exit. `start:go:review` remains an alias for the same workflow. For a deliberate production-backed preview, use `npm run start:go:live:tunnel`; that connection blocks simulation. Release builds ignore the review tunnel flag.

This creates no real payment or delivery. Keep the computer and the terminal running. Remote push and background rider GPS still require an installed native build and their respective setup; this checkout connection does not enable those Expo Go features.
