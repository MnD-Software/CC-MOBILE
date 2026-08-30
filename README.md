# Cake City Mobile

Native Cake City customer application for Android and iOS, built with Expo SDK 57,
React Native and strict TypeScript. It consumes the real Cake City platform API and does
not include sample products, customers, promotions, orders or payments.

## Configure

Copy `.env.example` to `.env.local` and set:

```text
EXPO_PUBLIC_API_URL=https://your-cake-city-api.example
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<google-web-oauth-client-id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<google-ios-oauth-client-id>
```

The Google client IDs are public identifiers. Never put a Google client secret,
WooCommerce credential, JWT secret or payment secret in this repository.

The Cake City API deployment must set `GOOGLE_OAUTH_AUDIENCES` to the comma-separated
Google OAuth client IDs accepted from Android and iOS. Apply database migration
`014_external_identities.sql` before enabling Google sign-in.

## Run

```powershell
npm ci
npx expo start --clear --localhost --port 8088
```

If Expo keeps reconnecting to the wrong bundle or crashes after several starts,
stop stale Expo processes first:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match 'expo.*start' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## View it on an Android phone

For the guest/UI preview, install **Expo Go** from Google Play, put the phone and
computer on the same Wi-Fi network, then run:

```powershell
npm run start:go
```

Scan the QR code from inside Expo Go. The terminal prints the current `exp://...`
address as an alternative. This path is suitable for reviewing the native UI and
catalogue experience. Real account calls need `EXPO_PUBLIC_API_URL` to point to a
backend that the phone can reach; `localhost` points to the phone itself.

### USB (Android Studio-style)

USB preview is supported. Enable **Developer options** and **USB debugging** on
the phone, unlock it, use a data-capable cable, and accept the RSA-debugging prompt.
Then run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
& $adb reverse tcp:8081 tcp:8081
npm run start:usb
```

The device must appear as `device` in the `adb devices -l` output. If the FastAPI
service is also running locally, reverse its port too (for example,
`& $adb reverse tcp:8000 tcp:8000`).

### Development build

Expo Go is enough for the guest/UI path. Native Google Sign-In requires a development
build because it includes custom native code. Once Google client IDs and a reachable
backend are configured, install the app through USB with:

```powershell
npm run android:device
```

Google Sign-In contains native code and therefore requires an Expo development build;
it is not an Expo Go acceptance path:

```powershell
npx expo run:android
```

## Authentication behavior

- Email registration uses `/v1/auth/mobile/register`.
- Email login uses `/v1/auth/mobile/login`.
- Google supplies an ID token to `/v1/auth/mobile/google`; only the backend validates it.
- Opaque rotating refresh tokens are stored in Expo SecureStore.
- Access tokens are held in memory and renewed through `/v1/auth/mobile/refresh`.
- Google sign-in remains visibly unavailable until real client IDs are configured. There is
  no fake success path.

See `docs/ARCHITECTURE_ASSESSMENT.md` for the system boundary and implementation plan.

## Codemagic iOS

The repository includes a signed iOS IPA workflow in `codemagic.yaml`. Connect this
GitHub repository to Codemagic and follow `docs/codemagic-ios.md` to configure the
build variables, Apple distribution certificate and provisioning profile.
