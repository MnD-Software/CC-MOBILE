# App orders: HQ delivery and location selection

App production and dispatch originate at Cake City HQ. The owner identified the address as **Cake City Call Centre, Soliton Academy, Wambugu Road**. The address is a draft for pin lookup; no unverified HQ coordinates or delivery radius are seeded into production.

## Rate source

Source: owner-supplied `Cakecity Order and Requisition Fullfilment.pptx`, slide 1.

| Fulfilment | Customer transport charge |
| --- | --- |
| Doorstep from HQ | KES 100 base + KES 30 per road kilometre |
| Collection at the production store (HQ) | KES 0 |
| Transfer from HQ to a configured pickup store | 50% of the applicable HQ-to-store delivery fee |

For 5.5 km, delivery is KES 265 and a pickup-store transfer is KES 132.50. Google returns whole road metres; charges are computed in KES cents, with fractional cents rounded up for the 50% transfer. The document's requisition/errand and rider payout rules are separate operational processes; this checkout change does not pay riders or create Odoo records.

## One-time setup on Render and the dashboard

1. Set `GOOGLE_MAPS_API_KEY` on the Render backend. Enable **Routes API** and **Geocoding API** in its Google Cloud project. This key stays on the server.
2. For the interactive map, set `GOOGLE_MAPS_BROWSER_KEY`, a separate **Maps JavaScript API** key restricted to the backend's map-page origin (`https://cc-mobile-1.onrender.com/*`). It is intentionally used by the map page; never use the server key here. A demo key only works if the required APIs, project billing and restrictions permit these calls. Use Google Cloud quotas appropriate to your account.
3. Deploy the latest backend. `python -m app.start` creates the new `app_delivery_quotes` table through the existing additive migration before serving traffic. No paid Render worker or background GPS service is required.
4. Open `/admin` → **Checkout & delivery** → **Configure HQ and delivery area**. Find HQ from the address, choose and verify the correct result, enter the approved radius in km, and enable HQ distance delivery. The radius is a geographic circle around HQ; road kilometres determine the fee. The app includes the 13 actual branch names and addresses copied from Cake City?s locations directory. Branches without a published pin are resolved by Google from their address when quoting; ambiguous or missing results require staff to confirm the pin. You can add and remove branches in this screen. No checkout request contacts the Cake City website.
5. Open **Configure checkout and tax**. Confirm listed prices and applicable tax treatment, set customer pickup instructions and enable checkout. These are business settings, not inferred tax recommendations.
6. Use **Check Pesapal account and callback setup**. It authenticates the configured merchant account and registers/checks its IPN callback. It does not submit an order or make a charge. Existing account rotation and live/sandbox separation remain in force.
7. Reload the updated app. Place a real order yourself and verify its APP reference, exact product/SKU and delivery amount, Pesapal confirmation, receipt, dashboard appearance and fulfilment progression. Automated tests use mocked Google/Pesapal responses and do not establish a live charge or native-device certification.

Google references: [Routes request and distance fields](https://developers.google.com/maps/documentation/routes/compute_route_directions), [Geocoding](https://developers.google.com/maps/documentation/geocoding/requests-geocoding), [API key restrictions](https://developers.google.com/maps/api-security-best-practices).

## Customer experience and authority

The customer chooses **Use my current location**, searches for a building/road/landmark, or moves a Google map to confirm the delivery entrance. GPS permission is requested only by the location button; search and map selection do not require device GPS permission. Search and resolved pins fill an editable address. Building, apartment, recipient and gift details remain editable. Coordinates are submitted to the app backend and to Google for routing/geocoding; no background location tracking is started.

The customer confirms the pin and fee before reviewing checkout. Outside-area locations fail before a road request. Missing Maps configuration, an unavailable road route or a provider outage never become free delivery. HQ pickup quotes require no Google request, although the HQ delivery policy and normal checkout must be configured.

Delivery quotes are customer-scoped, expire after 15 minutes, and bind the origin, destination, policy, road metres and fee. Checkout reads the server-owned quote ID; a client-supplied fee or distance is rejected. Enabling HQ pricing prevents a flat delivery zone from bypassing that rate. Policy changes invalidate existing quotes. The order freezes its route and charge alongside its selected SKU and totals. Customers see those details in order tracking and receipts; staff see them in **Orders**.

Payment still follows server pricing → app order → in-app Pesapal → verified callback/status → receipt, bag settlement and fulfilment. A map pin, provider return URL or button tap cannot mark an order paid.

For branch collection, staff should mark an order **ready** only after it reaches the selected pickup branch. The order and receipt retain that branch and its transport charge; customer instructions identify the branch rather than directing every pickup to HQ.
