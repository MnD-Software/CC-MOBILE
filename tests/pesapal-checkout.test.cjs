const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function client(localReview = false) {
  const calls = [];
  const result = {
    order_id: 123,
    order_key: "wc_order_private123",
    order_number: "123",
    status: "pending",
    billing_email: "buyer@example.com",
    payment_provider: "pesapal-api3",
    payment_state: "pending",
    payment_result: {
      payment_status: "pending",
      redirect_url: "https://pay.pesapal.com/pay",
    },
  };
  let response = result;
  const context = {
    exports: {},
    process: { env: { EXPO_PUBLIC_LOCAL_REVIEW: localReview ? "1" : "" } },
    require(name) {
      if (name === "zod") return require(name);
      if (name === "@/api/client")
        return {
          api: {
            post: async (...args) => {
              calls.push(args);
              return response;
            },
            get: async () => ({
              available: true,
              environment: "live",
              provider: "pesapal-api3",
            }),
          },
        };
      if (name === "./billing-profile")
        return {
          validateBillingProfile: (details) => {
            if (!details.postcode) throw new Error("Enter your postal code");
            return details;
          },
        };
      if (name === "./website-cart")
        return { websiteCartSchema: { parse: (value) => value } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/pesapal-checkout.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return {
    ...context.exports,
    calls,
    result,
    setResponse(value) {
      response = value;
    },
  };
}

const details = {
  firstName: "Test",
  lastName: "Buyer",
  email: "buyer@example.com",
  phone: "0712345678",
  address: "Test building",
  area: "Test area",
  city: "Nairobi",
  postcode: "00100",
  notes: "Handle carefully",
};
const session = {
  cartToken: "private-cart-token",
  cart: { items: [{ id: 12, quantity: 1 }], totals: { total_price: "250050" } },
};

test("Pesapal initiation sends the confirmed cart total and private token to the backend", async () => {
  const c = client();
  const order = await c.submitPesapalCheckout(session, details, "SAVE");
  const [path, body, options] = c.calls[0];
  assert.equal(path, "/v1/payments/pesapal/checkout");
  assert.equal(body.expected_total, "250050");
  assert.equal(body.expected_coupon, "SAVE");
  assert.equal(body.billing_email, "buyer@example.com");
  assert.equal(options.headers["Cart-Token"], session.cartToken);
  assert.equal(body.amount, undefined);
  assert.equal(body.expected_items[0].id, 12);
  assert.equal(order.payment_result.payment_status, "pending");
});

test("gift address and notes survive the Pesapal API boundary", async () => {
  const c = client();
  await c.submitPesapalCheckout(session, {
    ...details,
    gift: {
      firstName: "Recipient",
      lastName: "Person",
      phone: "0723456789",
      message: "Happy birthday",
    },
  });
  const body = c.calls[0][1];
  assert.equal(body.shipping_address.first_name, "Recipient");
  assert.equal(body.shipping_address.email, "");
  assert.equal(body.billing_address.first_name, "Test");
  assert.equal(
    body.customer_note,
    "Handle carefully\nGift message: Happy birthday",
  );
});

test("verification uses private receipt credentials and never trusts return URL claims", async () => {
  const c = client();
  await c.verifyPesapalCheckout(c.result, details.email);
  const [path, body] = c.calls[0];
  assert.equal(path, "/v1/payments/pesapal/orders/123/verify");
  assert.deepEqual(Object.keys(body).sort(), ["billing_email", "order_key"]);
  assert.equal(body.order_key, c.result.order_key);
});

test("local review blocks both real initiation and payment verification", async () => {
  const c = client(true);
  await assert.rejects(c.submitPesapalCheckout(session, details), /disabled/);
  await assert.rejects(
    c.quotePesapalCheckout(session, details, null),
    /disabled/,
  );
  await assert.rejects(
    c.verifyPesapalCheckout(c.result, details.email),
    /disabled/,
  );
  assert.equal(c.calls.length, 0);
});

test("incomplete billing is rejected before payment initiation", async () => {
  const c = client();
  await assert.rejects(
    c.submitPesapalCheckout(session, { ...details, postcode: "" }),
    /postal code/,
  );
  assert.equal(c.calls.length, 0);
});

test("a lost checkout response recovers its existing payment without a second initiation", async () => {
  const c = client();
  c.setResponse({ existing_payment: c.result });
  const quote = await c.quotePesapalCheckout(session, details, null);
  assert.equal(quote.existingOrder.order_id, 123);
  assert.equal(quote.cartToken, session.cartToken);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0][0], "/v1/payments/pesapal/quote");
});
