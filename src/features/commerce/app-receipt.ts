import type { AppOrder } from "./app-orders";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const amount = (minor: number) => `KES ${(minor / 100).toFixed(2)}`;

export function appReceiptHtml(order: AppOrder) {
  if (!order.paid_at || !order.snapshot)
    throw new Error("A receipt requires a verified payment.");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(order.reference)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#201720}h1{color:#b80068}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}.small{font-size:12px;color:#555}</style></head><body>
    <h1>Cake City</h1><h2>${order.payment_test ? "SIMULATED TEST RECEIPT - NO MONEY CHARGED" : "App payment receipt"}</h2><p>RCPT-${escape(order.reference)}</p>
    <p>Order: ${escape(order.reference)}<br>Channel: App<br>Paid: ${escape(order.paid_at)}<br>${order.payment_test ? "Simulation only. KES 100 Club qualifying value; no actual payment." : `Pesapal transaction: ${escape(order.tracking_id)}`}</p>
    ${order.environment === "sandbox" ? "<h2>SANDBOX — NOT A LIVE SALE</h2>" : ""}
    ${order.payment_state === "reversed" ? "<h2>PAYMENT REVERSED — CONTACT CAKE CITY</h2>" : ""}
    <table><tr><th>Product</th><th>Quantity</th><th>Amount</th></tr>${order.snapshot.lines.map((line) => `<tr><td>${escape(line.name)}<br><span class="small">SKU ${escape(line.sku_id)} / ${escape(line.selection?.size)} ${Array.isArray(line.selection?.variation_attributes) ? line.selection?.variation_attributes.map((a) => `${escape(a.attribute)}: ${escape(a.value)}`).join(" / ") : ""}</span></td><td>${escape(line.quantity)}</td><td>${amount(line.line_minor)}</td></tr>`).join("")}</table>
    ${order.snapshot.route ? `<p>Prepared at ${escape(order.snapshot.route.origin_name)}.<br>${escape(order.snapshot.route.destination_name)}: ${escape(order.snapshot.route.destination_address || `${order.snapshot.route.destination.latitude}, ${order.snapshot.route.destination.longitude}`)}.<br>${escape(order.snapshot.route.distance_meters / 1000)} km by road. ${escape(order.snapshot.route.rate)}.</p>` : ""}
    <p>Products: ${amount(order.snapshot.subtotal_minor)}<br>Delivery: ${amount(order.snapshot.delivery_minor)}<br>Discount: ${amount(order.snapshot.discount_minor)}<br>Tax component: ${amount(order.snapshot.tax_minor)}</p>
    <h2>${order.payment_test ? "Test total" : "Total paid"}: ${amount(order.total_minor)}</h2><p class="small">Payment receipt. This is not an eTIMS tax invoice. For assistance, open Requests &amp; support in the Cake City app.</p></body></html>`;
}
