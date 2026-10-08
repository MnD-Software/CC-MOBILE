# Cake City 0.2.7

Includes the shop, Profile, transaction history and delivery-address changes documented in [0.2.6](RELEASE_0.2.6.md).

- Celebrations and birthday benefits use the system date picker on iOS and Android. Web has a month/day calendar, including February 29. Only the chosen month and day are saved; customers confirm their selection. A date is never guessed or saved automatically.
- Membership card spacing is slightly tighter with a 266-point minimum height. Both faces can grow for larger text. Tier colors, delayed shine, reward summary, flip cue and barcode remain.
- Added the Expo SDK 57-compatible date-picker native module and plugin. The app version is 0.2.7 with the existing appVersion runtime policy so older installed binaries do not receive code requiring the new module.

Validation: TypeScript, 87 frontend tests, 29 backend tests and preview configuration checks passed. 19 browser checks cover responsive shop layouts, date selection and Club transactions with isolated private fixtures; native device visual checks remain outstanding. See the EAS build record for the finished replacement APK; canceled 0.2.6 builds are superseded.

The currently deployed backend was missing the transaction and address endpoints during verification. The app can read genuine recent transactions from the existing Club overview until the matching backend revision is deployed. Full pagination and saved-address writes require that deployment. Run `python verify_deployment.py https://cc-mobile-1.onrender.com` from `backend` after deployment. No extra environment variables or schema columns are needed for these routes.

## Completed Android preview

[EAS build f5cb2805-e6c2-4d5b-9e67-730374abb6ed](https://expo.dev/accounts/marcos_noel23/projects/cakecitymobiledev/builds/f5cb2805-e6c2-4d5b-9e67-730374abb6ed) finished successfully. [Download the APK](https://expo.dev/artifacts/eas/_j_ygmyW9yvtriw-EMD72AAs88iAvQkgF2liRTM5G1U.apk).

- Source commit: `da246bd19664198440bccac0fc74875efe6cbf90`
- Package: `ke.co.cakecity.mobile`, version 0.2.7, code 23
- Size: 117,273,808 bytes
- SHA256: `2ecda6cc7899f471826fa32b33beb023c640c520e63a515591d642fe03470471`
- APK v2 signature verified. Embedded bundle, live API URL, native date picker and native linear-gradient module verified.
- Android minimum SDK 24; target SDK 36. Includes arm64-v8a, armeabi-v7a, x86 and x86_64.
- Physical installation and native visual verification are still outstanding; no authorized Android device was connected.

The final live backend check still found the transaction and address routes missing. In Render, deploy the latest `master` commit through **Manual Deploy > Deploy latest commit**, then run the deployment verifier.
