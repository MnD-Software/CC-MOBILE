# Cake City build and deployment

## Supported baseline

Expo SDK 57 targets React Native 0.86 / React 19.2.3, with Node 22.13+, Android
7/API 24+, compile/target API 36, and iOS 16.4+ / Xcode 26.4+. Check store
submission rules at publication time. These are the
[versioned SDK requirements](https://docs.expo.dev/versions/v57.0.0/), not a claim
that every compatible handset has been tested.

## Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Actual HTTPS account/commerce API root, without trailing slash, credentials, query or fragment. Required in production. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Real EAS project UUID. Required for production builds and Expo push identity. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Public Google web OAuth client ID for native ID-token exchange. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Public iOS OAuth client ID; config derives its reversed URL scheme. |
| `GOOGLE_SERVICES_JSON` | Optional path to the Android Firebase config file. Required when activating Android FCM. Keep the file out of Git. |
| `CAKECITY_BUILD_PROFILE` | `preview` for internal APKs, `production` for distribution. |
| `JAVA_HOME`, `ANDROID_HOME` | Local Android JDK and SDK installation paths. |
| `GRADLE_USER_HOME` | Optional local Gradle cache override. The script otherwise isolates generated caches from the previously corrupted shared cache. |

Everything named `EXPO_PUBLIC_*` is visible in the app bundle. Never put payment
provider keys, WooCommerce consumer secrets, passwords or JWT signing secrets
there. Set those only in the backend's protected environment.

## Windows APK

```powershell
npm.cmd ci
$env:EXPO_PUBLIC_API_URL = '<actual deployed HTTPS API root>'
npm.cmd run android:release
```

If no API has been deployed, leave that variable unset. The generated test APK
can browse the live catalogue and reports account-service unavailability. It
cannot prove authentication, checkout or payment works.

The script is `scripts/rebuild-apk.ps1`. It copies owned source folders into
`C:\CakeCityBuild` (or a short, space-free `-BuildRoot`), excluding Git metadata, local
credentials, backups and generated outputs. It reuses locked dependencies only
when the lockfile matches, runs TypeScript/tests, invokes Expo prebuild, builds a
standalone release-mode APK, then verifies the package with Android build tools.

The short path prevents Windows Ninja/CMake from repeatedly treating long prefab
paths as missing. The script validates that Java actually starts, then uses
`JAVA_HOME`, Android Studio's runtime, or a portable JDK under
`%LOCALAPPDATA%\CakeCity-Toolchains`. Use JDK 17 or 21; merely having `java.exe`
is insufficient if the installation is damaged. Portable Temurin archives can be
[downloaded and verified with SHA256](https://adoptium.net/installation/archives/).

Default native architectures: `armeabi-v7a,arm64-v8a,x86,x86_64`. For an explicitly
ARM64-only test artifact:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rebuild-apk.ps1 -Architectures arm64-v8a
```

Outputs:

- `dist/CakeCity-0.2.0-preview.apk`
- `dist/build-manifest.json`: timestamp, version, native architectures, size, SHA256,
  signing type and API-configured flag
- `dist/apk-metadata.txt`: package, SDK, launcher and ABI metadata

Logs are `cc-*.log` in the staging directory. Failed commands stop the script.
Missing, stale, incorrectly versioned or incorrectly copied APKs are not reported
as successful. Local test APKs use Android's debug certificate; they are not
signed for Play distribution. Native configuration is generated from committed
Expo config, so the ignored `android/` folder is never the release source of truth.

The script ignores `.env.local` intentionally. Set build variables in the shell.
Do not run the obsolete manual clean/reparse scripts against dependencies or the
shared Gradle cache.

## Install and validate

```powershell
$adb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
& $adb devices -l
& $adb install -r dist/CakeCity-0.2.0-preview.apk
& $adb shell am start -a android.intent.action.VIEW -d 'cakecity://home'
```

For a repeatable native smoke check after building, run:

```powershell
node scripts/verify-android.cjs dist/CakeCity-0.2.0-preview.apk emulator-5554
```

Replace the serial with the authorized test device. This installs the actual APK,
force-stops it, cold-launches it without Metro, checks native routes and back
navigation, and saves screenshots, UI hierarchies and results under
`artifacts/android-qa`. The manifest is marked installation-tested only after
these checks pass and its SHA256 matches the tested file.

Require a device listed as `device`. If signing differs from an already installed
app, use a separately provisioned test device or deliberately uninstall that app
after preserving needed local data; never silently uninstall to make a test pass.
Verify cold start without Metro, catalogue images, all tabs, back navigation,
authentication and restoration, small/large text, checkout and payment recovery.

## EAS distribution

Authenticate and link the existing project with `npx eas-cli login` /
`npx eas-cli init`, set the production environment variables in EAS, and configure
the real Android upload keystore / Apple signing credentials.

```powershell
npx.cmd eas-cli build --platform android --profile preview
npx.cmd eas-cli build --platform android --profile production
npx.cmd eas-cli build --platform ios --profile production
```

Preview produces an internal APK. Production emits Android AAB and an iOS
distribution archive, with remote version increments. Production configuration
fails without a valid HTTPS API and real EAS project UUID. Run `npm run
release:check` with those variables before cloud submission.

For Codemagic, use `codemagic.yaml` and the `cakecity_ios` environment group.
The workflow installs development tools for checks, runs production validation,
typecheck, tests and Expo dependency validation, then prebuilds and signs on
macOS. Google IDs are optional until Google login is enabled. See
[codemagic-ios.md](codemagic-ios.md) for signing setup.

Windows prepares the project; macOS/EAS supplies Xcode, provisioning profiles and
the Apple distribution certificate. No local Windows IPA is claimed. The separate
Live Activity Swift files require a real widget extension target before shipping.

## Deployment order

1. Deploy and verify the API contracts in [API_INTEGRATION.md](API_INTEGRATION.md).
2. Supply approved branch, material, promotion and delivery rules on the server.
3. Configure provider sandbox callbacks and complete the payment acceptance tests.
4. Set the mobile production environment, signing and push credentials.
5. Build a fresh APK/AAB and signed iOS archive from the reviewed commit.
6. Verify on test devices and TestFlight/internal Play tracks.
7. Complete the [launch checklist](REBUILD_STATUS.md) before public submission.
