# Codemagic iOS Builds

The root `codemagic.yaml` generates the native iOS project from Expo SDK 57, validates the TypeScript and Expo dependencies, applies App Store signing, and creates a signed IPA. Builds are manual by default and are not automatically submitted to TestFlight or the App Store.

## Connect GitHub

1. In Codemagic, select **Add application** and connect the GitHub repository `MnD-Software/CC-MOBILE`.
2. Select the repository and let Codemagic scan the root `codemagic.yaml`.
3. Select the `Cake City iOS signed IPA` workflow.

## Configure build variables

Create a Codemagic application variable group named `cakecity_ios` with these values:

```text
EXPO_PUBLIC_API_URL=https://your-production-api.example
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<google-web-client-id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<google-ios-client-id>
```

The API URL must be reachable from a real iPhone. The workflow derives Google's required iOS callback URL scheme from the iOS client ID, so no Google secret or generated plist is committed to GitHub.

## Configure Apple signing

For bundle identifier `ke.co.cakecity.mobile`, add the following under **Team settings > codemagic.yaml settings > Code signing identities**:

- An Apple Distribution certificate with its private key.
- An App Store provisioning profile for `ke.co.cakecity.mobile`.

Alternatively, add an App Store Connect API key under **Team integrations > Developer Portal**, then use Codemagic to generate or fetch the distribution certificate and profile. The workflow's `ios_signing` block selects matching App Store identities and `xcode-project use-profiles` applies them.

## Run and download

Start the `Cake City iOS signed IPA` workflow manually. A successful build exposes the IPA under **Artifacts**. Codemagic's workflow build number is passed to Xcode as `CFBundleVersion`, so subsequent builds receive a higher build number.

The Swift files in `ios-live-activities/` are preparation for a separate Widget Extension. Expo prebuild does not add that extension automatically, so this workflow currently builds the main Cake City iOS app without the Live Activity widget target.
