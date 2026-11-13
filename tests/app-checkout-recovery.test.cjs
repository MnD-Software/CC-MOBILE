const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const z = require("zod").z;
const pause = () => new Promise((resolve) => setImmediate(resolve));
function checkout(optionOverrides = {}) {
  const states = [],
    refs = [],
    deps = [],
    effects = [],
    calls = [],
    saved = new Map();
  let cursor = 0,
    tree,
    creation = 0,
    starts = 0;
  const order = {
    reference: "APP-RECOVERED",
    status: "awaiting_payment",
    environment: "live",
    payment_state: "not_started",
    paid_at: null,
    total_minor: 250000,
    snapshot: { lines: [] },
  };
  const options = {
    pickup_enabled: true,
    pickup_instructions: "Collect at HQ",
    delivery_zones: [],
    ...optionOverrides,
  };
  const react = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (v) => {
          states[i] = typeof v === "function" ? v(states[i]) : v;
        },
      ];
    },
    useRef: (v) => {
      const i = cursor++;
      return refs[i] ?? (refs[i] = { current: v });
    },
    useEffect: (fn, next) => {
      const i = cursor++;
      if (!deps[i] || next.some((v, j) => v !== deps[i][j])) {
        deps[i] = next;
        effects.push(fn);
      }
    },
  };
  const bag = {
    lines: [
      {
        key: "cake",
        product_id: 12,
        name: "Cake",
        slug: "cake",
        quantity: 1,
        price: 2500,
        selection: { size: "1kg", message: "", add_ons: [] },
      },
    ],
    settle: async () => {},
  };
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  const api = {
    post: async (path, body, config) => {
      calls.push({ path, body, config });
      if (path === "/v1/app-checkout/quote")
        return {
          id: randomUUID(),
          total_minor: 250000,
          subtotal_minor: 250000,
          delivery_minor: 0,
          discount_minor: 0,
          tax_minor: 0,
        };
      if (path === "/v1/app-orders") {
        if (++creation === 1) throw Error("Response lost");
        return order;
      }
      throw Error(path);
    },
    get: async () => ({ order: null }),
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View", StyleSheet: { create: (v) => v } },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-image": { Image: "Image" },
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "expo-router": { router: { push() {}, replace() {} } },
    "expo-crypto": { randomUUID },
    "@/config/env": { env: { reviewCheckout: false } },
    "@tanstack/react-query": {
      useQuery: () => ({ data: options, isPending: false, isError: false }),
    },
    zod: { z },
    "@/api/client": { api, ApiError },
    "@/auth/AuthProvider": {
      useAuth: () => ({
        customer: {
          id: "buyer",
          first_name: "Test",
          last_name: "Buyer",
          email: "buyer@example.com",
          phone: "0712345678",
        },
      }),
    },
    "@/auth/secure-storage": {
      getStorageItem: async (k) => saved.get(k) || null,
      setStorageItem: async (k, v) => saved.set(k, v),
      deleteStorageItem: async (k) => saved.delete(k),
    },
    "./app-orders": {
      appOrderSchema: z.any(),
      appOrders: {
        start: async () => {
          starts++;
          return order;
        },
        detail: async () => order,
      },
    },
    "./billing-profile": {
      loadBillingProfile: async () => null,
      validateBillingProfile: (b) => b,
      saveBillingProfile: async () => {},
    },
    "./store": { useBag: (f) => f(bag) },
    "./contracts": { money: (v) => `KES ${v}` },
    "./checkout-success": { isVerifiedPayment: () => false },
    "./usePaymentSuccess": {
      usePaymentSuccess: () => ({ celebrate: false, endCelebration() {} }),
    },
    "./app-delivery": { distanceOptionsSchema: z.any() },
    "./HqDeliveryPicker": { HqDeliveryPicker: "HqPicker" },
    "./PickupBranchPicker": { PickupBranchPicker: "PickupPicker" },
    "./DeliveryAddressLocation": { DeliveryAddressLocation: "AddressLocation" },
    "@/components/storefront/CheckoutProgress": {
      CheckoutProgress: "Progress",
    },
    "./PaymentConfetti": { PaymentConfetti: "Confetti" },
    "./CheckoutCoupons": { CheckoutCoupons: "Coupons" },
    "@/components/ui/LoadingImage": { LoadingImage: "Image" },
    "./InAppPayment": { InAppPayment: "Payment" },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
  };
  for (const [name, label] of Object.entries({
    Button: "Button",
    Input: "Input",
    Typography: "Text",
    Disclosure: "Disclosure",
    Commerce: "Notice",
  }))
    modules[`@/components/ui/${name}`] = { [label]: label };
  const ctx = {
    exports: {},
    setInterval: () => 1,
    clearInterval() {},
    require: (n) => {
      if (n in modules) return modules[n];
      throw Error(`Missing ${n}`);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/PesapalCheckoutForm.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    ctx,
  );
  function render() {
    cursor = 0;
    const root = ctx.exports.PesapalCheckoutForm();
    tree = root.type(root.props);
    while (effects.length) effects.shift()();
  }
  function buttons(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [
      ...(node.type === "Button" ? [node] : []),
      ...(node.props?.children ? buttons(node.props.children) : []),
    ];
  }
  async function flush() {
    for (let i = 0; i < 4; i++) {
      render();
      await pause();
    }
  }
  function notices(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(notices);
    return [
      ...(node.type === "Notice" ? [node.props.message] : []),
      ...(node.props?.children ? notices(node.props.children) : []),
    ];
  }
  return { calls, saved, flush, buttons, notices, starts: () => starts };
}
test("unconfigured fulfilment explains the disabled checkout beside its total", async () => {
  const c = checkout({ pickup_enabled: false });
  await c.flush();
  assert.equal(
    c.buttons().find((b) => b.props.label === "Review confirmed total").props
      .disabled,
    true,
  );
  assert(
    c
      .notices()
      .some((message) =>
        /Ordering is waiting for pickup or delivery/.test(message),
      ),
  );
  assert.equal(c.calls.length, 0);
});

test("a single delivery area is selected automatically for the quote", async () => {
  const c = checkout({
    delivery_zones: [{ id: "local-delivery", name: "Delivery", fee_minor: 0 }],
  });
  await c.flush();
  const review = c
    .buttons()
    .find((b) => b.props.label === "Review confirmed total");
  assert.equal(review.props.disabled, false);
  review.props.onPress();
  await c.flush();
  const quote = c.calls.find((call) => call.path === "/v1/app-checkout/quote");
  assert.equal(quote.body.delivery_zone_id, "local-delivery");
  assert.equal(quote.body.fulfilment, "delivery");
});

test("a missing distance quote explains how to unlock checkout", async () => {
  const c = checkout({ distance_delivery: { enabled: true } });
  await c.flush();
  assert.equal(
    c.buttons().find((b) => b.props.label === "Review confirmed total").props
      .disabled,
    true,
  );
  assert(
    c
      .notices()
      .some((message) =>
        /Choose your delivery destination above/.test(message),
      ),
  );
});
test("lost app-order response locks new checkout and recovery reuses the original request without initiating payment", async () => {
  const c = checkout();
  await c.flush();
  c.buttons()
    .find((b) => b.props.label === "Review confirmed total")
    .props.onPress();
  await c.flush();
  assert.equal(
    c.buttons().filter((b) => b.props.label === "Review confirmed total")
      .length,
    0,
  );
  assert.equal(
    c.buttons().filter((b) => b.props.label.startsWith("Pay KES")).length,
    1,
  );
  c.buttons()
    .find((b) => b.props.label.startsWith("Pay KES"))
    .props.onPress();
  await c.flush();
  assert(!c.buttons().some((b) => b.props.label === "Review confirmed total"));
  const recover = c
    .buttons()
    .find((b) => b.props.label === "Recover existing order request");
  assert(recover);
  recover.props.onPress();
  await c.flush();
  const creates = c.calls.filter((c) => c.path === "/v1/app-orders");
  assert.equal(creates.length, 2);
  assert.equal(
    creates[0].config.headers["Idempotency-Key"],
    creates[1].config.headers["Idempotency-Key"],
  );
  assert.equal(creates[0].body.quote_id, creates[1].body.quote_id);
  assert.equal(c.starts(), 0);
  assert.equal(
    c.calls.filter((c) => c.path === "/v1/app-checkout/quote").length,
    1,
  );
  assert.match(c.saved.get("cakecity.app-checkout.buyer"), /APP-RECOVERED/);
});
