import { z } from "zod";
import type { WebsiteOrderAccess } from "./website-checkout";

/** Read credentials only from an official receipt; never fetch a supplied URL. */
export function parseOrderReceipt(
  receipt: string,
  email: string,
): WebsiteOrderAccess {
  const billingEmail = email.trim().toLowerCase();
  if (!z.email().safeParse(billingEmail).success || billingEmail.length > 254)
    throw new Error("Enter the billing email used for this order.");
  let url: URL;
  try {
    if (receipt.length > 2048) throw new Error();
    url = new URL(receipt.trim());
  } catch {
    throw new Error(
      "Paste the complete Cake City order-received link from your receipt.",
    );
  }
  const match = /^\/checkout\/order-received\/([1-9]\d*)\/?$/.exec(
    url.pathname,
  );
  const keys = url.searchParams.getAll("key");
  const id = Number(match?.[1]);
  if (
    url.protocol !== "https:" ||
    !["cakecity.co.ke", "www.cakecity.co.ke"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !match ||
    !Number.isSafeInteger(id) ||
    keys.length !== 1 ||
    !/^wc_order_[A-Za-z0-9_-]{4,128}$/.test(keys[0])
  ) {
    throw new Error(
      "Use the official Cake City order-received link, including its order key.",
    );
  }
  return { id, key: keys[0], billingEmail };
}
