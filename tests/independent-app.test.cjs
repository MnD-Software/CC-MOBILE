const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, modules) {
  const context = {
    exports: {},
    URL,
    require(name) {
      if (name in modules) return modules[name];
      if (name === "zod") return require(name);
      throw new Error("Unexpected dependency: " + name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}

test("in-app payment navigation blocks websites and external apps while handling the secure return", () => {
  const { paymentNavigation } = load("src/features/commerce/InAppPayment.tsx", {
    "react/jsx-runtime": {},
    "react-native": {},
    "react-native-webview": {},
    react: {},
    "@/components/ui/Button": {},
    "@/components/ui/Commerce": {},
    "@/config/env": { env: { apiUrl: "https://app.example.com" } },
  });
  assert.equal(paymentNavigation("https://pay.pesapal.com/pay"), "allow");
  assert.equal(paymentNavigation("https://bank.example.com/3ds"), "allow");
  assert.equal(
    paymentNavigation(
      "https://app.example.com/v1/payments/pesapal/return?status=success",
    ),
    "complete",
  );
  for (const url of [
    "https://cakecity.co.ke/checkout",
    "https://www.cakecity.co.ke/my-account",
    "intent://pay",
    "tel:0712345678",
    "http://pay.pesapal.com",
    "https://user:password@pay.pesapal.com/pay",
    "javascript:alert(1)",
  ])
    assert.equal(paymentNavigation(url), "block", url);
});

test("imported artwork is served by the app even when its original website is unavailable", () => {
  const { appMedia } = load("src/features/commerce/app-media.ts", {
    "@/config/env": { env: { apiUrl: "https://app.example.com" } },
  });
  const image = "https://cakecity.co.ke/wp-content/cake.avif";
  assert.equal(
    appMedia(image),
    "https://app.example.com/v1/app-media/source?url=" +
      encodeURIComponent(image),
  );
  assert.equal(
    appMedia("/v1/app-media/abc"),
    "https://app.example.com/v1/app-media/abc",
  );
});

test("order and payment requests address only app-owned routes with authenticated access", async () => {
  const calls = [];
  const order = {
    reference: "APP-20261103-1234567890ABCDEF",
    channel: "app",
    environment: "live",
    payment_account: "app-v1",
    status: "awaiting_payment",
    payment_state: "pending",
    total_minor: 250000,
    currency: "KES",
    created_at: "2026-11-03T08:00:00+00:00",
    paid_at: null,
  };
  const { appOrders } = load("src/features/commerce/app-orders.ts", {
    "@/features/logistics/delivery-feedback": load(
      "src/features/logistics/delivery-feedback.ts",
      {},
    ),
    "@/api/client": {
      api: {
        get: async (...args) => {
          calls.push(args);
          return args[0] === "/v1/app-orders"
            ? { data: [order], next_cursor: null }
            : order;
        },
        post: async (...args) => {
          calls.push(args);
          return order;
        },
      },
    },
  });
  await appOrders.list();
  await appOrders.detail(order.reference);
  await appOrders.start(order.reference);
  await appOrders.verify(order.reference);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.doesNotMatch(call[0], /https?:|website|woocommerce/);
    assert.equal(call.at(-1).auth, true);
  }
});

test("app receipt exports are escaped, app-referenced and require verified payment", () => {
  const { appReceiptHtml } = load("src/features/commerce/app-receipt.ts", {});
  assert.throws(() => appReceiptHtml({ paid_at: null }), /verified payment/);
  const order = {
    reference: "APP-20261103-ABC",
    environment: "sandbox",
    paid_at: "2026-11-03T10:00:00+03:00",
    tracking_id: "provider-123",
    payment_state: "completed",
    total_minor: 250000,
    snapshot: {
      subtotal_minor: 250000,
      delivery_minor: 0,
      discount_minor: 0,
      tax_minor: 0,
      lines: [
        {
          name: '<script>alert("test")</script>',
          quantity: 1,
          line_minor: 250000,
        },
      ],
    },
  };
  const html = appReceiptHtml(order);
  assert.match(html, /RCPT-APP-20261103-ABC/);
  assert.match(html, /SANDBOX/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|https?:\/\//);
  assert.match(html, /not an eTIMS tax invoice/);
});

test("active app orders, checkout and catalogue contain no website handoff", () => {
  for (const file of [
    "src/features/commerce/PesapalCheckoutForm.tsx",
    "src/features/commerce/AppOrdersScreen.tsx",
    "src/features/account/OrdersScreen.tsx",
    "src/features/commerce/api.ts",
    "app/legal.tsx",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /LegacyWebsiteCheckoutForm|fetchWebsiteOrder|prepareWebsiteCheckoutCart|websiteOrderUrl|Linking\.openURL|cakecity\.co\.ke/,
      file,
    );
  }
});
