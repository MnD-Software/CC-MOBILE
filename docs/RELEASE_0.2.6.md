# Cake City 0.2.6

- Strengthened semantic text, feedback, borders, primary buttons and surface contrast in light and dark modes. Logo pink remains #EC008C.
- Navigation highlight follows dragging, projects a short flick, and springs into its destination. Native interactive Liquid Glass on supported iOS; glossy fallback elsewhere. Reduced motion removes lens deformation and spring travel.
- Tier-colored membership card with a delayed front-only shine, raised edge and flip animation. No separate caption below the pass. Both faces reserve the taller layout height. The barcode face stays still for scanning.
- Branch pass uses Code128 containing CC1: followed by the public member UUID encoded as 22-character unpadded base64url. This identifies membership and never authorizes payment or redemption.
- Staff POS integration: authenticated POST /v1/admin/club/lookup with {"barcode":"CC1:..."}. Only existing staff/admin roles may use it. Returns member_id, name, tier, points, review_required; no email, phone, coupon or payment data. A branch scanner/POS must send its decoded text to this endpoint using the staff session. Do not embed staff tokens in customer apps or distribute them with printed passes.
- Includes the accumulated shop, homepage, Club dashboard, checkout simplification, pairing totals, safe order-storage keys and order tracking UI updates.

Validation: 73 frontend tests and 26 backend tests passed; release configuration passed for preview. Physical device, branch scanner and full checkout acceptance remain outstanding. This release does not establish free-tier throughput capacity.
