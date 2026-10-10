# Cake City: the celebration experience

Implemented in mobile version 0.2.8, with the simplified Campaign Studio in
0.2.9. Products, variation prices, stock and cart
totals remain connected to the existing WooCommerce checkout. Campaign content
is curated in the app backend, rather than imported from social feeds.

## What's included

- Home retains its approved carousel and Find your flavour navigator, with a
  shoppable story rail and upcoming celebration dashboard.
- Scheduled stories support photos, optional MP4 clips, linked product slugs or
  a real category, branch notes, member targeting and three editorial templates.
  Expired and unpublished stories do not appear. Countdown uses actual expiry.
- Product galleries open full screen, with thumbnails and optional detail photos,
  captions, clips, confirmed flavour, servings and preparation time.
- A three-step planner asks about occasion, flavour, guests and budget, suggests
  real cakes and lets customers choose actual variations and simple accessories.
  Its total includes the cake and all selected extras. Plans save on the device
  under the current account; prices are freshly resolved on the next visit.
- Saved celebrations show their next date, including safe February 29 handling.
  Confirmed preparation time can suggest an order-by date for a saved event.
- Club displays verified reward value and celebrates newly earned points or an
  issued reward. Initial loads and returning to the screen do not invent earnings.
- A short native splash fade and logo entrance, favourite bounce, bag count,
  option reveal and readable total transitions acknowledge customer actions.
  Reduced motion disables decorative movement; videos do not autoplay.
- Original native illustrations give empty bags and saved cakes a branded feel.
  They are decoration, separate from real product photography.

## Activate on Render

Use the existing backend environment and database. No new API key is required.
Deploy the latest `master`, with root directory `backend`, build command
`pip install -r requirements.txt` and start command `python -m app.start`.
Startup runs the additive schema migration for `editorial_content` and
`editorial_assets`; existing accounts, rewards and addresses are preserved.

Run `python verify_deployment.py https://cc-mobile-1.onrender.com` from `backend`.
The expected health release is `editorial-2026-10-10`. Public `GET /v1/content`
returns an empty campaign list until staff publish something. An older backend
keeps normal browsing working, but cannot publish new editorial content.

Register a real staff member through the app, then have the database operator run:

```powershell
python -m app.manage_staff --email staff@example.com --role staff
```

Run against the intended production database from a trusted operator environment.
On a free Render service without a shell, the operator can use the database SQL
console: `UPDATE customers SET role = 'staff' WHERE email = 'staff@example.com';`.
Replace the example with that existing staff account. Sign out/in afterwards.
The staff account then sees **Account → Campaign Studio**. Role is checked by the
server for every write; customers cannot grant themselves staff access.

## Publish a daily offer

1. Open **Profile > Campaign Studio > Create a story**. In **Photo & words**,
   choose a gallery photo, add a title and optional message, then choose the
   offer, spotlight or celebration style. Photos are automatically resized to
   fit the 2 MB upload limit; PNG artwork retains its transparency.
2. In **Choose cakes**, search the live catalogue by name and select up to eight
   cakes using their photos. Alternatively choose a collection by name. There
   are no product slugs or numeric category IDs to enter.
3. In **Preview**, review the customer-facing story, choose Tonight, Tomorrow
   or 7 days, then **Publish story**. Exact date/time, Club targeting, branch
   notes and video are optional disclosures. Dates use Nairobi time with native
   date pickers on phones. A future start changes the action to **Schedule story**.

Use **Save as draft** to finish later. Reopen a story from **My stories** to edit
it; badges distinguish Live, Scheduled, Draft and Ended. Unpublishing an existing
story is explicit. Revision checks protect another staff member's newer changes.
The app hides unpublished/expired stories and caches public content briefly, so
allow up to 30 seconds for another customer's refresh to show a change.

**Cake details** also starts with a searchable photo picker. Choose a cake and
add bakery-confirmed facts or extra photos, then publish or save as a draft.
Optional clips remain limited to 10 MB MP4; MOV/HEVC is not automatically converted.
An existing HTTPS image/video link is available as an optional advanced input.

Version 0.2.9 adds the native image-manipulation module. Install its fresh Android
APK rather than sending this source as an OTA update to 0.2.8. SDK 57 Expo Go
includes the module for development. No additional Render environment variable
or database migration is needed for the simplified Studio.

Set commercial sale prices, stock, coupon eligibility and branch restrictions in
WooCommerce/checkout. Story targeting is merchandising; it does not create or
enforce a discount. Do not put an unconfigured discount into the story copy.

Uploads are stored in PostgreSQL, so they survive free Render restarts. For a
large video library, use a media CDN and paste HTTPS URLs; database upload storage
is intentionally bounded per file and is not a substitute for a streaming CDN.

## Three reusable offer templates

| Template         | Visual direction                                      | Copy and action                                         |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Cake spotlight   | White canvas, one large actual cake image, pink label | Cake name + one appetising detail → Choose options      |
| Celebration edit | Actual occasion photography, warm pink/cream framing  | A birthday, graduation or family moment → Explore cakes |
| Offer of the day | Actual offer artwork, bold short title, clear expiry  | Confirmed offer and branch terms → Shop this story      |

The templates supply consistent framing and labels. Upload ready artwork; avoid
embedding tiny price text or long legal text inside an image. Native titles and
branch notes remain readable with larger system text.

## Photography guide

For each priority cake, photograph its exterior, a real slice and a close detail.
Use the same white/soft neutral background, soft directional daylight, accurate
icing colours and consistent scale. Export square 1200–1600 px JPEG/WebP, roughly
150–350 KB when quality allows. Keep cakes fully inside the crop. Product images
use `contain`; campaign artwork can fill its frame. No generated cake image should
be presented as a photograph of an actual product.

Use **Cake details** to add only bakery-confirmed servings, flavour and preparation
hours. Include size in servings (e.g. “1 kg: 8–10 people”). Unknown fields stay
absent. The planner asks customers to confirm servings when none are published.

## Motion and splash storyboard

Native launch: white logo splash → 180 ms native fade → optional 220 ms logo fade
into the mounted app. The entrance never holds a network request; maximum local
overlay duration is 300 ms. Validate native splash in an installed build, since
Expo Go does not faithfully display release splash configuration.

Press: subtle scale; favourite/bag feedback: 260 ms; option reveal: 180 ms; actual
total value stays readable during a 220 ms change; verified Club success: a bounded
650 ms burst. No automatic carousel movement or video playback. Clip playback
pauses when its screen loses focus or the app backgrounds.

## Acceptance

Verify a published story → actual product options → bag → existing checkout.
Also verify empty/expired stories, offline/old-server fallback, member sign-in,
staff conflicts, upload failures, reduced motion, larger text, small phones and
tablets. Test native Club flip, splash and video on both iOS and Android before a
store rollout. Automated/browser results do not establish physical-device support
or production payment, reward issuance, branch scanning or request-rate capacity.
