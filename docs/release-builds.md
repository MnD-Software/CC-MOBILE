# Cake City Release Builds

Version: `0.1.0+1`

Android local APK from this Windows checkout:

```sh
npm run android:release
```

Expected output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Production keystore placeholders:

```text
CAKECITY_RELEASE_STORE_FILE
CAKECITY_RELEASE_STORE_PASSWORD
CAKECITY_RELEASE_KEY_ALIAS
CAKECITY_RELEASE_KEY_PASSWORD
```

If those values are not present, Gradle falls back to the debug keystore so a local presentation APK can still be generated. That fallback APK is not suitable for Play Store release.

The native `android/` folder is generated and git-ignored in this Expo project. On a clean clone, use EAS for the first Android build, or run `npx expo prebuild --platform android` before the local Gradle command.

EAS Android APK:

```sh
npm run build:android:apk
```

iOS archive/TestFlight:

```sh
npm run build:ios:archive
```

iOS archive and IPA generation require macOS, Xcode, Apple Developer signing credentials, and the Live Activities Widget Extension target configured in Xcode.
