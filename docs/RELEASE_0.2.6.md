# Cake City 0.2.6

- Strengthened semantic text, feedback, borders, primary buttons and surface contrast in light and dark modes. Logo pink remains #EC008C.
- Navigation highlight follows dragging, projects a short flick, and springs into its destination. Native interactive Liquid Glass on supported iOS; glossy fallback elsewhere. Reduced motion removes lens deformation and spring travel.
- Tier-colored membership card with a delayed front-only shine, raised edge and flip animation. No separate caption below the pass. Both faces reserve the taller layout height. The barcode face stays still for scanning.
- Branch pass uses Code128 containing CC1: followed by the public member UUID encoded as 22-character unpadded base64url. This identifies membership and never authorizes payment or redemption.
- Staff POS integration: authenticated POST /v1/admin/club/lookup with {"barcode":"CC1:..."}. Only existing staff/admin roles may use it. Returns member_id, name, tier, points, review_required; no email, phone, coupon or payment data. A branch scanner/POS must send its decoded text to this endpoint using the staff session. Do not embed staff tokens in customer apps or distribute them with printed passes.
- Includes the accumulated shop, homepage, Club dashboard, checkout simplification, pairing totals, safe order-storage keys and order tracking UI updates.

Validation: 73 frontend tests and 26 backend tests passed; release configuration passed for preview. Physical device, branch scanner and full checkout acceptance remain outstanding. This release does not establish free-tier throughput capacity.

## iOS render correction and review

The first EAS build d22133f0-9eb4-49ca-860e-41f7f23d7660 (Android code 21) was canceled after the iOS development session reported `Cannot read property layout of null`. Both membership-face layout callbacks had captured a pooled native event inside a deferred state updater. The correction snapshots its numeric height synchronously. A regression test reproduces the exact failure against the previous source and passes for both corrected handlers.

Follow-up polish: compact 220-point membership card with room to grow for larger text; visible Tap to flip cue; front-only delayed shine; customer-oriented branch-pass copy; pill-shaped shop choices; reward and tier progress outside the card; white default canvas; optional dark/system themes retained under appearance settings; simplified account header with direct saved-address and request links.

The user confirmed that Club now opens and flips correctly in Expo Go on iPhone. Fresh terminal logs contain no later render failures. A replacement Android preview build may proceed after final checks. A canceled build is not a delivered APK.
