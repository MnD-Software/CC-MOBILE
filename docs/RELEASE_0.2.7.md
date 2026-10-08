# Cake City 0.2.7

Includes the shop, Profile, transaction history and delivery-address changes documented in [0.2.6](RELEASE_0.2.6.md).

- Celebrations and birthday benefits use the system date picker on iOS and Android. Web has a month/day calendar, including February 29. Only the chosen month and day are saved; customers confirm their selection. A date is never guessed or saved automatically.
- Membership card spacing is slightly tighter with a 266-point minimum height. Both faces can grow for larger text. Tier colors, delayed shine, reward summary, flip cue and barcode remain.
- Added the Expo SDK 57-compatible date-picker native module and plugin. The app version is 0.2.7 with the existing appVersion runtime policy so older installed binaries do not receive code requiring the new module.

Validation: TypeScript, 87 frontend tests, 29 backend tests and preview configuration checks passed. Browser checks cover responsive shop layouts and Club transactions with isolated private fixtures; native device visual checks remain outstanding. See the EAS build record for the finished replacement APK; canceled 0.2.6 builds are superseded.

The currently deployed backend was missing the transaction and address endpoints during verification. The app can read genuine recent transactions from the existing Club overview until the matching backend revision is deployed. Full pagination and saved-address writes require that deployment. Run `python verify_deployment.py https://cc-mobile-1.onrender.com` from `backend` after deployment. No extra environment variables or schema columns are needed for these routes.
