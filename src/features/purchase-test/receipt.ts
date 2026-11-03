import type { TestReceipt } from "./client";
import { purchaseName } from "./model";

export function receiptText(receipt: TestReceipt) {
  return [
    "CAKE CITY",
    "Purchase receipt",
    receipt.receipt_id,
    new Date(receipt.issued_at).toLocaleString(),
    receipt.billing.name,
    receipt.billing.email,
    receipt.billing.address,
    "",
    ...receipt.items.map(
      (item) =>
        `${item.quantity} x ${purchaseName(item.name)} - KES ${((item.unit_minor * item.quantity) / 100).toFixed(2)}`,
    ),
    `Total: KES ${(receipt.amount_minor / 100).toFixed(2)}`,
    "Payment: SIMULATED SUCCESS - no money charged",
    `Club points earned: +${receipt.points_earned}`,
    `Points balance at purchase: ${receipt.membership_at_purchase.points}`,
    `Membership at purchase: ${receipt.membership_at_purchase.tier}`,
    "",
    "Preview receipt. No real order or money charged. Not a tax invoice.",
    ...(receipt.current_refunded_minor
      ? [
          `Refund adjustment: KES ${(receipt.current_refunded_minor / 100).toFixed(2)}`,
        ]
      : []),
  ].join("\n");
}

export function receiptHtml(receipt: TestReceipt) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cake City purchase receipt</title><style>
    body{font-family:Arial,sans-serif;color:#252025;margin:48px}h1{color:#B80068;font-size:28px}
    .note{color:#686068;font-size:11px;margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 Arial,sans-serif}
    </style></head><body><h1>Cake City</h1><pre>${escape(receiptText(receipt))}</pre><p class="note">Preview receipt · simulated payment · no money charged · not a tax invoice.</p></body></html>`;
}
