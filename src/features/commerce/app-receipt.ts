import { tokens } from "../../theme/tokens";
import type { AppOrder } from "./app-orders";
import { RECEIPT_LOGO } from "./receipt-logo";

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .replace(/&amp;/g, "&")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
const amount = (minor: number) =>
  `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pretty = (value: unknown) =>
  String(value ?? "")
    .replace(/^pa_/, "")
    .replace(/[_-]+/g, " ");

export function appReceiptHtml(order: AppOrder) {
  if (
    !order.paid_at ||
    !order.snapshot ||
    !["completed", "reversed"].includes(order.payment_state)
  )
    throw Error("A receipt requires a verified payment.");
  const s = order.snapshot,
    c = s.checkout,
    b =
      c.billing && typeof c.billing === "object"
        ? (c.billing as Record<string, unknown>)
        : {},
    pickup = c.fulfilment === "pickup";
  const name = [b.first_name, b.last_name].filter(Boolean).join(" ");
  const date = new Date(order.paid_at).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = order.review_checkout
    ? "Order confirmation"
    : order.payment_test
      ? "Test receipt"
      : "Payment receipt";
  const collected =
    order.review_checkout || order.payment_test ? 0 : order.total_minor;
  const row = (label: string, value: number) =>
    `<div class="sum-row"><span>${escape(label)}</span><strong>${amount(value)}</strong></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)} · ${escape(order.reference)}</title><style>
 @page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:${tokens.color.ink};font:12px/1.5 Arial,Helvetica,sans-serif}.receipt{max-width:800px;margin:auto}.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:25px;border-bottom:2px solid ${tokens.color.brandStrong}}.logo{width:126px;height:95px;object-fit:contain}.heading{text-align:right}.eyebrow,.label{font-size:9px;letter-spacing:2px;font-weight:700;color:${tokens.color.brandStrong};text-transform:uppercase}h1{font-size:27px;letter-spacing:-.8px;margin:6px 0;color:${tokens.color.ink}}h2{font-size:14px;margin:6px 0}.reference{font:10px monospace;color:${tokens.color.muted}}.status{display:inline-block;padding:6px 12px;border-radius:30px;background:${tokens.color.successLight};color:${tokens.color.success};font-size:10px;font-weight:bold;margin-top:9px}.meta{display:flex;gap:24px;margin:25px 0}.meta>div{flex:1;min-width:0}.muted,.details{color:${tokens.color.muted}}.details{font-size:10px;line-height:1.8}.notice{padding:12px 16px;border-radius:12px;background:${tokens.color.warningLight};color:${tokens.color.warning};margin:16px 0}table{width:100%;border-collapse:collapse;margin:24px 0}thead{background:${tokens.color.brandLight};display:table-header-group}th{padding:11px 10px;text-align:left;font-size:9px;letter-spacing:1px;color:${tokens.color.muted};text-transform:uppercase}td{padding:15px 10px;border-bottom:1px solid ${tokens.color.border};vertical-align:top}th:last-child,td:last-child{text-align:right;white-space:nowrap}th:nth-child(2),td:nth-child(2){text-align:center;width:50px}.product{font-weight:bold;font-size:12px}.message{display:block;padding:5px 0;color:${tokens.color.brandStrong};font-style:italic}.summary-wrap{display:flex;justify-content:flex-end;margin:25px 0}.summary{width:310px;max-width:100%}.sum-row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;color:${tokens.color.muted}}.sum-row strong{color:${tokens.color.ink}}.grand{background:${tokens.color.brandLight};border-radius:16px;padding:16px;margin-top:10px}.grand .sum-row{color:${tokens.color.ink};font-size:14px}.grand strong{font-size:20px;color:${tokens.color.brandStrong}}.collected{margin-top:10px;border-top:1px dashed ${tokens.color.borderStrong}}.fulfilment{background:${tokens.color.surfaceRaised};border:1px solid ${tokens.color.border};border-radius:16px;padding:18px;margin:20px 0}.thanks{text-align:center;padding:24px 10px;border-top:1px solid ${tokens.color.border}}.thanks strong{font-size:18px;color:${tokens.color.brandStrong};display:block;margin-bottom:5px}footer{font-size:9px;color:${tokens.color.muted};text-align:center;line-height:1.8}tr,.meta,.grand,.fulfilment,.thanks{break-inside:avoid}@media(max-width:480px){.meta{flex-direction:column;gap:12px}.logo{width:95px;height:75px}h1{font-size:23px}.summary{width:100%}}

 .receipt{padding:30px 32px;border:1px solid ${tokens.color.border};border-radius:24px;background:${tokens.color.surface};box-shadow:0 12px 45px rgba(73,48,46,.06)}.header{position:relative;padding:4px 0 24px;border-bottom:1px solid ${tokens.color.border}}.header:before{content:"";position:absolute;top:-34px;left:-32px;right:-32px;height:6px;background:linear-gradient(90deg,${tokens.color.brandPressed},${tokens.color.brand});border-radius:24px 24px 0 0}.logo{width:137px;height:auto;max-height:90px}.meta{padding:18px;background:${tokens.color.surfaceRaised};border-radius:16px;gap:18px}.meta h2{overflow-wrap:anywhere}.product{font-size:13px;line-height:1.5}.sum-row{font-variant-numeric:tabular-nums}.grand{border:1px solid ${tokens.color.border};background:linear-gradient(120deg,${tokens.color.brandLight},${tokens.color.surface})}.grand .sum-row:last-child{align-items:center}.collected strong{color:${tokens.color.success}}.thanks{margin-top:24px;padding-top:26px}footer{padding-top:12px}td:first-child{overflow-wrap:anywhere}@media screen{body{padding:24px 16px;background:${tokens.color.background}}}@media(max-width:480px){body{padding:12px 8px}.receipt{padding:22px 16px;border-radius:20px}.header{align-items:flex-start;gap:12px}.header:before{top:-26px;left:-16px;right:-16px}.eyebrow{font-size:8px;letter-spacing:1px}.reference{overflow-wrap:anywhere}h1{font-size:20px}.meta{padding:14px}th,td{padding-left:6px;padding-right:6px}.thanks strong{font-size:17px}}@media print{body{background:#fff;padding:0}.receipt{padding:0;border:0;border-radius:0;box-shadow:none}.header:before{display:none}.meta,.grand,thead,.status{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body><main class="receipt"><header class="header"><img class="logo" src="${RECEIPT_LOGO}" alt="Cake City logo"><div class="heading"><span class="eyebrow">A celebration worth keeping</span><h1>${title}</h1><div class="reference">RCPT-${escape(order.reference)}</div><span class="status">${order.payment_state === "reversed" ? "Payment reversed" : order.review_checkout ? "Order confirmed" : "Payment confirmed"}</span></div></header>
 ${order.environment === "sandbox" && !order.review_checkout ? '<div class="notice">SANDBOX — NOT A LIVE SALE</div>' : ""}${order.payment_test && !order.review_checkout ? '<div class="notice">SIMULATED TEST RECEIPT — NO MONEY CHARGED</div>' : ""}${order.payment_state === "reversed" ? '<div class="notice">PAYMENT REVERSED — CONTACT CAKE CITY. This receipt does not represent a retained payment.</div>' : ""}
 <section class="meta"><div><span class="label">Prepared for</span><h2>${escape(name || "Our valued customer")}</h2><span class="muted">${escape(b.email)}<br>${escape(b.phone)}${order.tax_invoice?.buyer_pin || b.kra_pin ? "<br>Buyer KRA PIN: " + escape(order.tax_invoice?.buyer_pin || b.kra_pin) : ""}</span></div><div><span class="label">Order details</span><h2>${escape(order.reference)}</h2><span class="muted">${escape(date)}<br>Ordered in the app</span></div><div><span class="label">${pickup ? "Collection" : "Delivery"}</span><h2>${pickup ? "Branch pickup" : escape(c.recipient_name || name)}</h2><span class="muted">${pickup ? escape(s.pickup_instructions || "We will notify you when your cake is ready.") : escape(b.address)}${!pickup && b.area ? "<br>" + escape(b.area) : ""}</span></div></section>
 <table><thead><tr><th>Your celebration</th><th>Qty</th><th>Line total</th></tr></thead><tbody>${s.lines.map((l) => `<tr><td><span class="product">${escape(l.name)}</span><div class="details">${escape(l.selection.size)}${Array.isArray(l.selection.variation_attributes) ? l.selection.variation_attributes.map((a) => ` · ${escape(pretty(a.attribute))}: ${escape(pretty(a.value))}`).join("") : ""}<br>Unit price ${amount(l.unit_minor)}</div>${l.selection.message ? `<span class="message">“${escape(l.selection.message)}”</span>` : ""}</td><td>${l.quantity}</td><td><strong>${amount(l.line_minor)}</strong></td></tr>`).join("")}</tbody></table>
 <section class="summary-wrap"><div class="summary">${row("Products & extras", s.subtotal_minor)}${row(pickup ? "Pickup / transport" : "Delivery", s.delivery_minor)}${s.discount_minor ? row("Coupon savings", -s.discount_minor) : ""}${s.tax_minor ? row("Tax component", s.tax_minor) : ""}<div class="grand">${row(order.review_checkout ? "Order value" : "Total", order.total_minor)}<div class="collected">${row("Amount collected", collected)}</div></div></div></section>
 ${s.route ? `<section class="fulfilment"><span class="label">Your route</span><h2>${escape(s.route.origin_name)} → ${escape(s.route.destination_name)}</h2><span class="muted">${escape(s.route.destination_address)}<br>${escape(s.route.distance_meters / 1000)} km by road · ${escape(s.route.rate)}</span></section>` : ""}<div class="details">${order.tracking_id ? `Transaction reference: ${escape(order.tracking_id)}` : `Order payment reference: ${escape(order.reference)}`}</div><section class="thanks"><strong>Made with care. Shared with love.</strong><span class="muted">Thank you for making us part of your moment.</span></section><footer>Keep this receipt for order tracking and support. Open Your orders or Requests &amp; support in the app.<br>This is an app ${order.review_checkout ? "order confirmation" : "payment receipt"}, not an eTIMS tax invoice. Values are in Kenyan shillings.</footer></main></body></html>`;
}
