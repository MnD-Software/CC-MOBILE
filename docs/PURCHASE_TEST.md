# Purchase, points and receipt review

The project uses **Expo SDK 58**. On the iPhone, Expo Go's App info must list **Supported SDK: 58.0.0** (client 58.0.5 is compatible). The Expo Go client version and SDK version are different numbers. Restart the preview after upgrading dependencies, then scan its generated QR code again.

Run `npm run preview:purchase` on the development computer. This starts a separate payment simulator on port 8011 and an Expo Go preview on port 8083. Keep the terminal running and connect the iPhone to the same Wi-Fi. Sign into Expo Go using the same Expo account as the computer.

`npm run start:go` also starts the connected simulator and uses Expo Go's usual port 8081. Use one of these commands at a time; each owns the test service on port 8011. This prevents starting a generic Expo session without its test-payment connection. The generated QR and `RUNNING.json` always identify the current preview. Scan the current QR after restarting or changing networks.

The terminal shows startup stages, a scannable QR code and Metro's bundle logs. Opening the QR on the iPhone requests the JavaScript bundle; leaving the preview waiting before a device connects is normal. This command runs an Expo Go preview rather than creating an installable app binary. Logs and the QR image are also saved under `artifacts/purchase-test/`.

The review runner clears inherited CI mode so Expo can advertise the development session in Expo Go and enable file watching. The computer and iPhone must both be signed into the same Expo account. If the session list is empty, scan the generated QR with the iPhone camera. Keep Expo Go's Local Network permission enabled and use the same Wi-Fi as the computer. Startup in the OneDrive workspace can take a few minutes.

Open the generated QR image at `artifacts/purchase-test/iphone-qr.png`. The local eight-digit access code is in ignored `artifacts/purchase-test/TEST-ACCESS.txt`. Enter it once in **Connect membership**. Neither the code nor the operator's simulator credentials are embedded in the app bundle.

The QR opens the app's main `/checkout` route. Payment is contained in checkout; there is no global payment banner or separate membership dashboard above other screens. The existing colours, navigation and Club membership card remain. A compact disclosure beside payment and on receipts identifies the preview and that no money moves. The KES 100 reward cupcake is separate from the ordinary shopping bag, which is kept. Nothing opens the website or Pesapal. Without an explicitly configured local service, main checkout shows that in-app payment is unavailable. The old website form remains an unmounted migration component.

The isolated server prices the **reward cupcake** at **KES 100**. Every successful preview purchase earns **25 points**. Enter billing details and tap **Pay KSh 100**:

| Successful purchases | Test points | Test membership |
| -------------------- | ----------- | --------------- |
| 1                    | 25          | Bronze          |
| 2                    | 50          | Silver          |
| 3                    | 75          | Silver          |
| 4                    | 100         | Gold            |
| 5                    | 125         | Diamond         |
| 6                    | 150         | Platinum        |

These short purchase milestones apply only to this isolated preview. Diamond is one purchase after Gold, and Platinum is the next purchase. The live Club's spend-based thresholds are unchanged. Existing preview purchases count toward the new milestones; saved receipts keep their original membership snapshot. After changing backend rules, stop the current runner with Ctrl+C and run `npm run start:go` again, then reload Expo Go. The existing database and pairing code are retained.

The card and Club progress bars animate toward the final milestone, Platinum at six purchases, while the text names the next challenge. Bronze, Silver, Gold, Diamond and Platinum each have a distinct card palette. A newly achieved tier triggers confetti from both sides of the screen and a dismissible **View new card** prompt above the navigation. The prompt takes the member directly to the front of their updated card. The celebration follows navigation, does not repeat on refresh or ordinary purchases, and respects Reduce Motion by showing the prompt without confetti. Existing members establish their current tier as the baseline when the app opens.

The product card shows points before purchase. Success opens the saved purchase receipt with **View my Club** and **View my orders**. Normal Club, Profile and Club transactions read the same server-confirmed preview balance. Each successful purchase has a receipt link in transactions and an entry in Orders. **Buy again** returns to checkout with billing retained. Earlier purchases made with the same paired identity also appear. Preview rules remain separate from live Club and Enquest.

After successful payment the server atomically saves an immutable receipt snapshot. Later purchases do not change its points or tier at purchase. Refund adjustments reduce the current Club balance and the corresponding transaction. Failed, timed-out and cancelled payments issue neither points nor a payment receipt. Operator-only review controls remain on `/purchase-test` under **Payment review controls**, away from normal checkout.

The receipt provides **Save / share receipt PDF** using Expo Print and the share sheet, plus **Share receipt text**. Browser printing opens only the receipt. Exports identify the simulated payment, zero real funds and that they are not tax invoices. Automated QA exports `artifacts/purchase-test/TEST-receipt.pdf`.

If interrupted, use **Check payment status**. The app persists the request key, original billing and outcome before the first request; recovery reuses them. Repeated taps and recovery cannot award points twice. **Start a new preview membership** in operator controls requires confirmation and retains earlier records under the previous isolated identity.

## Billing details

Signed-in customers can open **Account → Billing details**, edit their contact/address fields and tap **Save billing details** without placing an order. Checkout also links to this screen. Save validation and storage errors are displayed explicitly. Native fields use the existing per-account Keychain/Keystore storage; browser review keeps them only for the current browser session. This is a device convenience profile, not a new server address book or fiscal billing profile. KRA PIN/eTIMS and cross-device billing remain separate work.

Billing profiles now include a required five-digit Kenyan postal code, preserving leading zeroes. Older saved profiles keep their existing fields but ask for the postal code at the next save. This fixes a confirmed mismatch in the retained website adapter: the live store's Kenya locale requires `postcode`, while that adapter used to send an empty string. Missing website field labels produced the screenshot's unhelpful “is required” message. The adapter now validates the postal code before order submission and replaces that unlabelled error with actionable feedback. No live order or payment was created while diagnosing it.

The legacy migration form retains saved billing restoration and preserves current edits. Main checkout uses the independent test flow described above. Real in-app payments require an approved native provider integration; starting ordinary Expo Go without test flags does not enable live payment.

## Isolation and verification

- The test server uses only `artifacts/purchase-test/payment-sandbox-review.db`, with the existing sandbox-only metadata. Its routes are never mounted on the live commerce app.
- Enablement requires a development/local/test environment, the explicit mobile-review switch and an operator-generated pairing code. Production and hosted review/staging refuse this local phone pairing mode. Failed pairing attempts are limited.
- Paired tokens last 24 hours and authorize only that synthetic member's records. They cannot call the operator's generic simulator routes. Live app tokens, WooCommerce, real Club points and production data are not used by this test client.
- The client requires an explicit development LAN URL and a simulated-service response marker. EAS/release checks reject the test URL and local-review flag.
- No funds, stock allocation, dispatch, real revenue, Enquest points, fiscal invoice or email delivery is created.
- `node scripts/verify-purchase-test.cjs` runs the real UI/API flow: six purchases through Platinum in checkout, receipts, normal Club, transaction receipt links and Orders; milestone prompts, side confetti, card reveals, progress toward Platinum and Reduce Motion; the original receipt after later purchases; failed outcomes with zero Club points/transactions; and PDF export. It needs only `start:go` or `preview:purchase`. External browser writes are blocked. Billing profile validation/save/restore has separate unit coverage.
- Native iPhone printing/share-sheet behavior still requires tapping the controls on an actual device; browser PDF output does not establish native verification.

The full corporate/Command Center/CRM/BI/AI brief remains tracked in `SUPER_APP_IMPLEMENTATION.md`. This increment completes the local payment-and-loyalty review path and explicit device-local billing save; it does not complete those remaining modules or activate live providers.
