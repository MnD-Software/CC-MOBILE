# Order tracking and dispatch — 11 November 2026

Version 0.3.2 applies the concierge's plum/pink visual direction to Orders and Track your cake. The Home concierge entry is hidden; `/concierge` redirects to Orders, saved talk/reorder invocations open Shop, and newly generated launcher/Siri shortcut menus advertise tracking only. Keep `CONCIERGE_ENABLED=false` on Render.

## Customer experience

Customers see the order stage, recorded kitchen milestones, rider assignment/acceptance/collection/in-transit events, the assigned rider's contact when available, and their rider's latest GPS position on a map. Delivery details poll every five seconds while Ready or Out for delivery and the screen is active. Completed and failed orders stop polling. Receipts and technical detail sit behind a disclosure.

Map movement reflects received GPS fixes. A location older than 90 seconds is marked stale, and one older than 15 minutes disappears. The app also ages markers locally if network polling fails. There is no invented ETA or road route. The checkout destination appears only when the dispatch destination still matches it; address overrides do not silently keep an unrelated destination pin. This map uses Leaflet and attributed OpenStreetMap tiles and requires network access to their assets. Before significant public traffic, configure an appropriate tile provider under its usage terms.

## Rider workflow

Dispatch assigns a provisioned rider to a verified paid order after a production location is assigned. The rider accepts, then collects after Kitchen marks the cake Ready, then starts delivery. After collection, the rider can explicitly tap **Share live delivery location** and grant foreground location permission. Keep the rider screen open. Positions update approximately every five seconds when the phone supplies a usable GPS fix.

This release implements foreground sharing. Switching apps, locking the phone or leaving the rider screen pauses sharing. Background navigation tracking requires a separate native background-location implementation and physical-device validation; it is not included or claimed here. The UI explains this boundary. Delivery can still complete with a confirmation when GPS permission is denied.

Only the assigned rider can publish or stop their trip location. Customers receive location only through their own authenticated order detail. The API retains one current fix per trip, ignores older fixes, rejects invalid coordinates, inaccurate fixes above 200 metres, stale timestamps and updates outside the collected/in-transit stages. Delivery completion, failure, cancellation or explicit stop removes the current fix. Private order responses use `Cache-Control: private, no-store`. Status history exposes stage and timestamp, not staff notes or delivery proof.

## Dispatch troubleshooting

The web dashboard previously saved a rider name/phone without creating a logistics task, and its kitchen actions could omit production assignment. It now assigns an actual rider/driver account through `POST /v1/logistics/orders/{reference}/tasks`, and kitchen work records the production location and responsible login first. Handover, transit, exceptions and proof of delivery update the individual task with revision checks. The rider dropdown lists provisioned rider/driver accounts; free-text contact details cannot substitute for a rider login. Existing legacy assignments need a real task allocated through the updated workspace.

The expected flow is **paid → kitchen assignment → preparing → ready → rider acceptance → collection → in transit → delivery confirmation**. Pickup orders use customer collection rather than a delivery task. A rider account must have the `rider` or `driver` role. Branch staff need the appropriate logistics scope. A generic customer account cannot access Dispatch.

To provision a real driver: register their account normally, then an authorized server operator runs `python -m app.manage_staff --email <registered-driver-email> --role driver` from the backend environment. The driver must sign out and sign back in. Do not promote a customer account merely to bypass a failed allocation; use the intended driver's identity. Missing driver accounts cannot be supplied by typing a name into Dispatch.

Dispatch waits for both the queue and assignment records before offering allocation. Existing assignments count against purchased quantities, so retries cannot allocate the same goods twice. Stale task failures refresh their revision before another action. Completed trips are collapsed, and polling pauses while workspaces are hidden. Rider delivery confirmation is disabled until proof is entered.

On 11 November the hosted API responded and exposed the logistics and rider routes, but did not yet expose `/v1/delivery-tracking/map`. That read-only check did not reproduce the user's specific authenticated dispatch failure. Redeploy this commit and start with `python -m app.start` so the additive `rider_positions` table is created. If an action still fails, record its displayed error, order reference and actor role; do not bypass readiness or payment checks.

## Recently viewed and buttons

Product detail screens now record history only while visible and only for the matching route identity. A preference migration clears history recorded by the previous background-screen behavior while retaining favourites and other preferences. Prefetches and catalogue recommendations do not create viewing history. Buttons stretch consistently within their container, have a minimum touch height, and allow two centred text lines rather than cutting long labels into a fixed single-line height.

## Validation boundary

Automated tests cover location ownership, collected/terminal stage restrictions, current GPS fixes, stale/out-of-order fixes, explicit stop, private dispatch events, map-shell privacy and the full kitchen/rider/payment lifecycle. Local browser verification uses synthetic coordinates and an isolated no-charge order. It cannot prove physical rider GPS accuracy, native WebView rendering, background tracking or deployment success. Test a signed iPhone/Android build with two separate accounts before public rollout.
