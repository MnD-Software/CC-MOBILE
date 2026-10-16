# Cake City Mobile

Native Cake City customer app for Android and iOS, using Expo SDK 57, React Native
and strict TypeScript. It has five focused destinations: Home, Shop, Orders,
Loyalty and Account. Its glossy white interface only renders products returned by
the Cake City mobile API.

The live deployment currently supports email registration, sign-in, session
refresh/logout and current catalogue browsing. Checkout, tracking, rewards,
addresses and Google/password-reset identity remain backend dependencies, so the
app presents those areas honestly rather than sending customers into failed calls.

## Development

Use Node.js 22.13 or newer. On Windows:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run typecheck
npm.cmd test
npm.cmd start
```

`.env.example` is preconfigured with `https://cc-mobile-1.onrender.com`; change it
only for an intentional staging build. Local HTTP is allowed only in development.
A phone interprets `127.0.0.1` as itself; use a reachable LAN address or USB port
forwarding for local development.

There are no production demo customers, fake orders, simulated payments or
fallback product records. Saved cakes are explicitly device-local and revalidated
against the live catalogue before they are shown.

## Android APK

```powershell
# Preview APK for installation and presentation
npx.cmd eas-cli build --platform android --profile preview

# Production Android App Bundle
npx.cmd eas-cli build --platform android --profile production

# Local, signed test APK (requires Android tooling)
$env:EXPO_PUBLIC_API_URL = 'https://cc-mobile-1.onrender.com'
npm.cmd run android:release
```

The local build script stages source outside OneDrive, installs locked dependencies
when needed, runs checks, regenerates Android configuration and verifies APK
signing, identity, version and SHA256. It emits `dist/CakeCity-0.2.0-preview.apk`
plus `dist/build-manifest.json`. The APK uses a test certificate and embeds its
bundle, so it does not require Metro.

Preview and production EAS profiles both embed the mobile API URL. The local APK
script deliberately does not read a workstation `.env.local`, so set the variable
shown above when producing a local artifact.

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
