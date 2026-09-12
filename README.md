# Cake City Mobile

Native Cake City customer app for Android and iOS, using Expo SDK 57, React Native
and strict TypeScript. The rebuilt app has Home, Shop, Custom, Orders and Account
tabs, real WooCommerce browsing, secure account/payment integration and a
configuration-driven Cake Studio.

The deployed account API and several backend capabilities still need activation
and end-to-end verification. See [rebuild status](docs/REBUILD_STATUS.md) for the
feature inventory, validation evidence and launch blockers.

## Development

Use Node.js 22.13 or newer. On Windows:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run typecheck
npm.cmd test
npm.cmd start
```

Set `EXPO_PUBLIC_API_URL` in `.env.local` to your backend. Local HTTP is allowed
only in development. A phone interprets `127.0.0.1` as itself; use a reachable LAN
address or USB port forwarding for local development.

The public catalogue works without the account API. There are no production
demo customers, fake orders, simulated payments or fallback product records.
Saved designs and the bag persist locally; account favourites and addresses use
the backend.

## Android APK

```powershell
# Optional until the deployed backend is available:
$env:EXPO_PUBLIC_API_URL = '<actual deployed HTTPS API root>'
npm.cmd run android:release
```

The build script stages source outside OneDrive, installs locked dependencies when
needed, runs checks, regenerates Android configuration and verifies APK signing,
identity, version and SHA256. It emits `dist/CakeCity-0.2.0-preview.apk` plus
`dist/build-manifest.json`. The APK uses a test certificate and embeds its bundle,
so it does not require Metro. A missing API is recorded in the manifest.

Build environment variables are explicit: the local APK script deliberately does
not read a workstation `.env.local`. Omit the API variable for catalogue-only
review; rebuild with the real HTTPS endpoint for account/checkout testing.

## Store and iOS builds

```powershell
npx.cmd eas-cli build --platform android --profile production
npx.cmd eas-cli build --platform ios --profile production
```

EAS production emits Android AAB / signed iOS archive and requires the actual API,
EAS project identity and platform signing credentials. iOS compilation requires
EAS/macOS, Xcode and Apple signing; Windows does not generate an IPA locally.

Google Sign-In and native push require an installed native build with the correct
Google/FCM/APNs configuration. The reference Live Activities Swift files are not
linked into a shipping widget target.

## Handoff

- [API contracts and backend work](docs/API_INTEGRATION.md)
- [Build, environment and deployment instructions](docs/release-builds.md)
- [Architecture, features and QA checklist](docs/REBUILD_STATUS.md)
- [Production audit](docs/PRODUCTION_AUDIT.md)
- [Codemagic iOS setup](docs/codemagic-ios.md)
