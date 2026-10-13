# Premium redesign review — 13 October 2026

The implemented direction is crisp white with Cake City pink used for actions,
neutral card edges, restrained shadows and native system typography. Home has an
editorial introduction and fitted offer photography. Shop gives the two-column
catalogue the full width and moves categories into a horizontal rail. Navigation
gives each destination equal weight. Product, bag, checkout, Club, Account and
supporting routes share the same surfaces and controls.

The [specification](PREMIUM_REDESIGN.md) contains research and scope.
The [checkpoint tracker](PREMIUM_CHECKPOINTS.md) records completion and external gates.
These screenshots are browser captures of the implemented app, not native device
captures or owner visual acceptance.

## Screens for review

| Screen           | Capture                                               | Data boundary                                                |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Home             | [Open](premium-redesign/home.png)                     | Live public Cake City catalogue                              |
| Shop             | [Open](premium-redesign/shop.png)                     | Live public catalogue, fitted photography                    |
| Product          | [Open](premium-redesign/product.png)                  | Live product and variation response                          |
| Bag              | [Open](premium-redesign/bag.png)                      | Real catalogue product added locally; no order submitted     |
| Checkout contact | [Open](premium-redesign/checkout-fixture.png)         | Isolated cart fixture; no payment or production cart writes  |
| Checkout summary | [Open](premium-redesign/checkout-summary-fixture.png) | Isolated cart fixture using that product's observed price    |
| Club member      | [Open](premium-redesign/club-fixture.png)             | Explicit QA Preview account and balance fixture              |
| Member Account   | [Open](premium-redesign/account-fixture.png)          | Explicit QA Preview account fixture                          |
| Registration     | [Open](premium-redesign/register.png)                 | Form only; no real account created                           |
| Tablet Shop      | [Open](premium-redesign/shop-tablet.png)              | 834px viewport, live public catalogue                        |
| Campaign Studio  | [Open](premium-redesign/studio-fixture.png)           | Isolated staff/editorial fixtures; no production publication |

## Verification

- TypeScript check passed. App tests: **120 passed, 0 failed**.
- Formatting and production release configuration passed with the deployed HTTPS API URL.
- Web, Android and iOS bundle exports passed. Native exports are bundles, not APK/IPA builds.
  [Validation record and source/bundle hashes](premium-redesign/validation.json).
- Browser: **41 visits, 25 unique routes, 42 screenshots, 0 unhandled exceptions**.
  [Saved result](premium-redesign/browser-result.json).
- Home/Shop have no horizontal page overflow at 320, 390, 430 and 768px;
  834px tablet Shop was also captured. Budget requests, appearance persistence,
  guest coupon save/select/remove, real product addition, bag quantity changes,
  gift fields and the membership card flip passed.
- Staff Studio: **9 checks, 0 unhandled exceptions**, including fitted previews at
  320/390/430/768px, photo preparation, cake selection, fixture publishing,
  revision-aware unpublishing and cake detail saves.
  [Saved result](premium-redesign/staff-result.json).
- No real account, order, payment or editorial write was made by these checks.
  Public catalogue GETs use the checker's native transport bridge because web
  CORS and native transport differ. Local fixtures establish UI behavior only.

Visual inspection covered Home, Shop, Product, Account, Club, registration, bag,
checkout, orders, celebration planning/calendar and staff publishing. Review
fixed an invisible icon on a restyled panel, white text on the member profile,
raw HTML entities in checkout names, an empty coupon incorrectly labelled
"applied", and tier names that incorrectly fell back when lowercased. The card's
hardcoded 100-point reward meter was removed; Club's confirmed rules remain the
source for reward progress and redemption availability.

## Reproduce

Run from the repository root in PowerShell:

```powershell
$env:EXPO_PUBLIC_API_URL = 'https://cc-mobile-1.onrender.com'
npm.cmd run typecheck
npm.cmd test
npm.cmd run format:check
npm.cmd run release:check
node scripts/expo.cjs export --platform web --output-dir artifacts/premium-redesign/export
node scripts/expo.cjs export --platform android --platform ios --output-dir artifacts/premium-redesign/native
```

Start a disposable headless Edge profile on port 9322, then run the main checker:

```powershell
$reviewProfile = Join-Path $env:LOCALAPPDATA ('CakeCity-QA\premium-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9322',('--user-data-dir="' + $reviewProfile + '"'),'--no-first-run','about:blank'
$env:CAKECITY_QA_OUTPUT = 'artifacts/premium-redesign/review'
$env:CAKECITY_QA_NATIVE_TRANSPORT = '1'
$env:CAKECITY_QA_PREMIUM = '1'
node scripts/verify-web.cjs artifacts/premium-redesign/export
$env:CAKECITY_EDITORIAL_QA_OUTPUT = 'artifacts/premium-redesign/staff-review'
node scripts/verify-editorial.cjs artifacts/premium-redesign/export --studio
```

The main checker closes its disposable browser. The staff checker launches its
own browser. Both run against the exported app; the fixture paths exist only in
the QA scripts and never enter the app bundle.

Full local evidence: `artifacts/premium-redesign/accepted-source/` and
`artifacts/premium-redesign/staff-verified/`. The former directory name refers to
the checked source revision; owner visual acceptance remains pending. Selected
captures and result JSON are retained in this documentation folder for review.

## Remaining acceptance

No current redesign APK/IPA was built or installed. No physical Android device
was connected at the start. An Android emulator booted and became authorized
after restarting ADB, but this revision was not installed or runtime-verified;
the review emulator was stopped. iOS runtime review is also outstanding.

The next native gate is a compatible build containing this revision, foreground
installation/launch, route/back/keyboard checks, large text and accessibility
review, and performance traces on Android and iOS. Native glass appearance and
device performance have not been established by browser captures or bundles.

Existing service placeholders remain explicit: branch capacity/slots, maintained
allergen data, reviews, password recovery and provider-dependent capabilities
require their respective backend/provider work. See the scope boundaries in the
specification. GitHub publication, Render deployment, OTA distribution and store
builds were not performed for this redesign. Owner visual acceptance is pending.
