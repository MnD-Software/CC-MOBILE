# Cake City 0.2.6

The shop now keeps its category choices and filter toolbar separate from the scrolling product grid. The sidebar and both horizontal toolbars scroll independently. Two-column product cards retain the full-width **Choose options** button below each cake. Category, budget and sort sheets use draft selections with explicit Apply and Clear actions. Popularity and price sorting apply to catalogue requests across all pages.

Profile has a clearer identity header, shortcuts to orders and saved cakes, an address summary and the customer's actual Club tier and points. Club has a **View transactions** sheet with authenticated, paginated points history. Older backend deployments show the real recent activity already returned by Club until the history route is deployed.

The complete earlier, larger membership card is restored. Tier colors, points, reward summary, delayed front-only shine and the Tap to flip cue remain. Both faces reserve the taller measured height. Explicit face opacity prevents the reverse gradient showing through during rotation on Android; hardware compositing is enabled. Barcode bars fit the measured width and use whole physical pixels when space permits. The barcode face remains still for scanning.

The iOS pooled-event render failure is corrected by reading layout height synchronously before the state updater runs. Android Expo Go no longer evaluates the unsupported notifications entrypoint during startup. Installed apps retain notifications and verified order tracking; Expo Go reports unavailable capabilities without crashing.

Checkout can fill a delivery address from foreground location permission, a saved address or a searched destination. Late geolocation responses cannot overwrite an address that the customer has edited or a different recipient's destination. Customers can save, edit and delete their own addresses and select a default. Ordering for someone else clears the sender's address. Customers still review their address and explicitly confirm payment.

The default canvas is white with stronger text, border and button contrast. The brand pink remains `#EC008C`. Existing navigation motion, safe-area handling, reduced-motion behavior and optional appearance settings remain.

## Backend deployment

Deploy the matching repository revision to the existing backend service. No additional environment variables or database columns are required by these additions; the existing database and authentication configuration must remain available.

- `GET/POST /v1/account/addresses`
- `PUT/DELETE /v1/account/addresses/{address_id}`
- `GET /v1/club/transactions?limit=20&before=<entry-id>`

Address access and transaction cursors are scoped to the signed-in customer. Address defaults are serialized per owner. Transaction pages use a stable timestamp and ID cursor.

The branch pass is Code128 containing `CC1:` followed by the public member UUID encoded as 22-character unpadded base64url. It identifies membership and never authorizes payment or redemption. Existing staff/admin sessions may call `POST /v1/admin/club/lookup` with the scanned barcode. A branch POS/scanner must still be connected to that endpoint; customer apps must never contain staff credentials.

## Validation and delivery limits

87 frontend regression tests and 29 backend tests passed. TypeScript and the preview release configuration checks passed. Current iOS and Android development bundles compiled. Browser checks cover live public products, fixed shop controls, category/budget/sort sheets, Profile and Club with isolated test account fixtures, card flipping and paginated transactions at widths from 320 to 768 pixels.

The user previously confirmed Club opening and flipping in Expo Go on iPhone. That confirmation predates the latest card-compositing changes. Fresh physical iOS/Android visual checks, branch scanning and full checkout acceptance remain outstanding. Browser fixtures are not production membership data. Free-tier throughput has not been established by these tests.

Android preview builds `d22133f0-9eb4-49ca-860e-41f7f23d7660` and `750b951a-8bdd-4b83-80b2-156c408bfce4` were canceled because later fixes superseded them. They are not delivered APKs. The replacement build must be verified as finished before sharing its artifact.
