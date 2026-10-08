# Shop and Club update - 8 October 2026

## Club diagnosis

The public OpenAPI response from https://cc-mobile-1.onrender.com on 8 October still had only the original routes. Club, benefits, celebrations, enquiries and pairings were absent. This identifies older deployed source; restarting that commit cannot add these routes. No customer credentials or real orders were used for diagnosis.

The previous pre-deploy instructions assumed a paid Render service. Free web services do not support that command. This release changes Start Command to `python -m app.start`, which adds/validates tables before starting Uvicorn. It defaults to one worker for the free instance. Keep a persistent PostgreSQL DATABASE_URL and the existing JWT_SECRET. SQLite on the free service filesystem cannot retain customer balances across redeploys. Back up PostgreSQL before applying schema changes. Migration refuses incompatible existing columns.

Deploy the updated backend source to the branch actually connected to Render. Root Directory: `backend`. Build Command: `pip install -r requirements.txt`. Start Command: `python -m app.start`. Remove the old pre-deploy command. Preserve existing secrets and configure server-only WooCommerce order-read/coupon-write credentials and webhook secret. `WEB_CONCURRENCY=1` is the default. Redis is optional, with distributed limits inactive when absent. No production load-capacity claim applies to the free plan.

After deploying, run `python backend/verify_deployment.py https://cc-mobile-1.onrender.com`. Health should identify release `club-shop-2026-10-08`. Verify real membership, coupon issuance and refund reversal separately. Membership reads allow 65 seconds for cold startup and explain missing server routes; no fake membership is created.

## Shop and home

Fixed image sidebar: All, Vanilla, Signature, Chocolate, Cheesecakes, Cupcakes, Offers. Contextual filters select matching bases/flavours. Signature requires both signature and selected base categories. Missing published listings stay empty, including signature pound and filled cupcakes if WooCommerce does not classify them.

Checked Caramel, Blueberry, Strawberry and New York Style cheesecake pages: no preparation-time evidence published. Add a visible WooCommerce attribute `Preparation time` with `24 hours` or `48 hours`, or corresponding category labels. Confirm the Store API includes it. The app reads published labels and does not guess. Plain/Frosted/Filled cupcake classification reads published names, descriptions, attributes and category labels.

Vanilla sponge is labelled Instant and pound cakes 24 hours as requested. These labels do not reserve fulfilment capacity; checkout remains authoritative.

Shop uses two product columns, image sidebar, contextual chips, search and budget filter. Shop promotional banner/page title removed. Home begins with the deals carousel followed by categories; introductory copy and concierge cards removed. Pink Simba uses the current WebP image. Primary fills/navigation accents use measured logo pink #EC008C; darker pink remains for readable text.

Bottom dock sits above the reported safe-area inset plus 10 points; scrolling content reserves clearance. Existing platform/version checks retain supported native glass effects and older-OS fallbacks. Native device, gesture/three-button navigation, large text and installed-app review remain required; source checks do not prove all-device rendering.

## Verification and artifacts

71 app tests passed, as did typecheck, changed-file formatting, preview release configuration and a web bundle export. The full backend suite passed 20 tests; the additional production-storage guard then passed its targeted startup suite (two tests). Native device review is outstanding.

Android preview 0.2.5 (code 20): build `bec9cbdf-5cbf-4469-92be-0aab8666f27a` at https://expo.dev/accounts/marcos_noel23/projects/cakecitymobiledev/builds/bec9cbdf-5cbf-4469-92be-0aab8666f27a. Submission does not mean the build is complete; consult the build record.

Verified EAS status: FINISHED on 8 October at 08:52 Nairobi time. APK: https://expo.dev/artifacts/eas/uGe_boO3mGEx16mbcxv_Llrzwr6bf-Dcs6epvCxMoNY.apk. Local copy: `artifacts/CakeCity-0.2.5-preview.apk`, 117,011,016 bytes, SHA256 `5dee914bf6556ed8fbdab45917b14974533a1dae03ca2f58a518c2ab5ceba3ce`. ZIP integrity and the new Club error message embedded in the Android bundle passed checks. No Android device was connected for installed-app review.

Backend package: `artifacts/cakecity-backend-2026-10-08.zip`. It is source for deployment, not a ZIP uploaded directly to Render. Copy the backend files into the repository/branch connected to your Render service, commit/push them, then deploy. This session has not pushed or deployed backend changes.

When updating WooCommerce preparation labels, keep the Cheese Cakes category checked. Use a visible, non-variation attribute called Preparation time with value 24 hours or 48 hours. Save attributes and Update the product, then confirm the Store API includes the label. Pull to refresh Shop after updating; catalogue queries otherwise cache for five minutes.
