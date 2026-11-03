import { z } from "zod";
import { randomUUID } from "expo-crypto";
import {
  getStorageItem,
  setStorageItem,
  deleteStorageItem,
} from "@/auth/secure-storage";

const outcome = z.enum(["succeeded", "failed", "timed_out", "cancelled"]);
export type TestOutcome = z.infer<typeof outcome>;
export type TestBilling = { name: string; email: string; address: string };
const item = z.object({
  sku: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unit_minor: z.number().int(),
  test_points: z.number().int().nonnegative().default(0),
});
const payment = z.object({
  id: z.string().startsWith("TEST-"),
  simulated: z.literal(true),
  status: z.enum(["pending", ...outcome.options]),
  amount_minor: z.number().int().positive(),
  refunded_minor: z.number().int(),
  currency: z.literal("KES"),
  created_at: z.string(),
  items: item.array(),
});
const membership = z.object({
  simulated: z.literal(true),
  points: z.number().int().nonnegative(),
  purchases: z.number().int().nonnegative(),
  tier: z.enum(["Bronze", "Silver", "Gold", "Diamond", "Platinum"]),
  next_tier: z
    .object({ name: z.string(), purchases_remaining: z.number().int() })
    .nullable(),
  milestones: z
    .object({ purchases: z.number().int(), name: z.string() })
    .array(),
});
export const testStateSchema = z.object({
  simulated: z.literal(true),
  membership,
  product: z.object({
    name: z.string(),
    sku: z.literal("TEST-REWARD-CAKE"),
    unit_minor: z.number().int().positive(),
    test_points: z.number().int().positive(),
  }),
  history: payment.array(),
});
export const testReceiptSchema = payment.extend({
  receipt_id: z.string(),
  issued_at: z.string(),
  label: z.string(),
  payment_method: z.literal("Simulated payment"),
  billing: z.object({
    name: z.string(),
    email: z.string(),
    address: z.string(),
  }),
  points_earned: z.number().int(),
  membership_at_purchase: membership,
  current_refunded_minor: z.number().int(),
  fiscalized: z.literal(false),
  funds_settled: z.literal(false),
  real_revenue_minor: z.literal(0),
});
export type TestState = z.infer<typeof testStateSchema>;
export type TestPayment = TestState["history"][number];
export type TestReceipt = z.infer<typeof testReceiptSchema>;
const sessionSchema = z.object({
  simulated: z.literal(true),
  token: z.string().startsWith("test."),
  expires_at: z.number(),
});
const pendingSchema = z.object({
  request_key: z.string(),
  billing: z.object({
    name: z.string(),
    email: z.string(),
    address: z.string(),
  }),
  payment_id: z.string().optional(),
  outcome: outcome.optional(),
});

export function purchaseTestOrigin() {
  if (!__DEV__) return null;
  const value = process.env.EXPO_PUBLIC_PURCHASE_TEST_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const privateHost =
      /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        url.hostname,
      );
    if (
      url.protocol !== "http:" ||
      !privateHost ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function storageKey(kind: string) {
  const origin = purchaseTestOrigin();
  if (!origin)
    throw new Error(
      "This purchase test is available only in the local test preview.",
    );
  // SecureStore keys permit only letters, numbers, dot, hyphen and underscore.
  const scope = Array.from(origin)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `cakecity.purchase-test.v1.${scope}.${kind}`;
}

async function storedSession() {
  const raw = await getStorageItem(storageKey("session"));
  try {
    const value = sessionSchema.parse(JSON.parse(raw ?? "null"));
    return value.expires_at * 1000 > Date.now() ? value : null;
  } catch {
    return null;
  }
}

async function request(
  path: string,
  options: { body?: unknown; auth?: boolean } = {},
) {
  const origin = purchaseTestOrigin();
  if (!origin)
    throw new Error("Start the local purchase test preview on your computer.");
  const session = options.auth === false ? null : await storedSession();
  if (options.auth !== false && !session)
    throw new Error("Connect using the test code first.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(origin + path, {
      method: options.body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    if (response.headers.get("X-CakeCity-Simulated") !== "true")
      throw new Error(
        "This address is not the isolated test service. Payment was stopped.",
      );
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401 && options.auth !== false)
        await deleteStorageItem(storageKey("session"));
      throw new Error(
        typeof body.detail === "string"
          ? body.detail
          : "Check the test billing fields and try again.",
      );
    }
    if (body.simulated !== true)
      throw new Error("The test service returned an unexpected response.");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const purchaseTest = {
  connected: async () => Boolean(await storedSession()),
  async connect(code: string) {
    // Check isolation before sending even the test pairing code.
    const health = await request("/health", { auth: false });
    if (health.schema !== "sandbox-v1")
      throw new Error("The test service version does not match.");
    const session = sessionSchema.parse(
      await request("/v1/test-checkout/session", {
        auth: false,
        body: { code: code.trim() },
      }),
    );
    await setStorageItem(storageKey("session"), JSON.stringify(session));
    await deleteStorageItem(storageKey("pending"));
  },
  async state() {
    return testStateSchema.parse(await request("/v1/test-checkout/state"));
  },
  async pending() {
    const value = await getStorageItem(storageKey("pending"));
    return value ? pendingSchema.parse(JSON.parse(value)) : null;
  },
  async billing(): Promise<TestBilling | null> {
    const value = await getStorageItem(storageKey("billing"));
    if (!value) return null;
    try {
      return pendingSchema.shape.billing.parse(JSON.parse(value));
    } catch {
      return null;
    }
  },
  async pay(billing: TestBilling, selectedOutcome: TestOutcome = "succeeded") {
    let pending = await this.pending();
    if (!pending) {
      pending = {
        request_key: randomUUID(),
        billing,
        outcome: selectedOutcome,
      };
      // Persist BEFORE any network request; retry always reuses this payment.
      await setStorageItem(storageKey("pending"), JSON.stringify(pending));
      await setStorageItem(storageKey("billing"), JSON.stringify(billing));
    }
    if (!pending.payment_id) {
      const result = payment.parse(
        await request("/v1/test-checkout/purchases", {
          body: { request_key: pending.request_key, billing: pending.billing },
        }),
      );
      pending.payment_id = result.id;
      await setStorageItem(storageKey("pending"), JSON.stringify(pending));
    }
    const result = payment.parse(
      await request(
        `/v1/test-checkout/purchases/${pending.payment_id}/complete`,
        { body: { outcome: pending.outcome ?? selectedOutcome } },
      ),
    );
    await deleteStorageItem(storageKey("pending"));
    return result;
  },
  async receipt(id: string) {
    return testReceiptSchema.parse(
      await request(
        `/v1/test-checkout/purchases/${encodeURIComponent(id)}/receipt`,
      ),
    );
  },
  async fresh() {
    const session = sessionSchema.parse(
      await request("/v1/test-checkout/new-run", { body: {} }),
    );
    await setStorageItem(storageKey("session"), JSON.stringify(session));
    await deleteStorageItem(storageKey("pending"));
  },
};
