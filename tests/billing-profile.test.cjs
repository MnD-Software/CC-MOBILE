const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function profileClient(storage = new Map(), failure) {
  const context = {
    exports: {},
    require(name) {
      if (name === "zod") return require("zod");
      if (name === "@/auth/secure-storage")
        return {
          getStorageItem: async (key) => storage.get(key) ?? null,
          setStorageItem: async (key, value) => {
            assert.match(key, /^[A-Za-z0-9._-]+$/);
            if (failure) throw failure;
            storage.set(key, value);
          },
        };
      throw new Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/billing-profile.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return context.exports;
}
const fields = {
  firstName: " Test ",
  lastName: " Buyer ",
  email: " Buyer@Example.com ",
  phone: "+254 (712) 345-678",
  address: " Test building ",
  area: " Test area ",
  city: " Nairobi ",
  postcode: " 00100 ",
};
test("billing saves without payment and restores the same account's normalized details", async () => {
  const store = new Map();
  await profileClient(store).saveBillingProfile("buyer-1", fields);
  const restored = await profileClient(store).loadBillingProfile("buyer-1");
  assert.equal(restored.firstName, "Test");
  assert.equal(restored.email, "buyer@example.com");
  assert.equal(restored.phone, "+254712345678");
  assert.equal(restored.address, "Test building");
  assert.equal(restored.postcode, "00100");
  assert.equal(await profileClient(store).loadBillingProfile("buyer-2"), null);
});
test("invalid billing details and failed secure storage never report a successful save", async () => {
  const api = profileClient();
  for (const change of [
    { email: "wrong" },
    { firstName: " " },
    { phone: "123" },
    { address: " " },
    { postcode: "" },
    { postcode: "1234" },
    { postcode: "ABCDE" },
  ])
    await assert.rejects(
      api.saveBillingProfile("buyer-1", { ...fields, ...change }),
    );
  const failure = new Error("Keychain unavailable");
  await assert.rejects(
    profileClient(new Map(), failure).saveBillingProfile("buyer-1", fields),
    (error) => error === failure,
  );
  await assert.rejects(api.saveBillingProfile("", fields), /Sign in/);
});

test("profiles saved before postal codes retain their details and require completion before payment", async () => {
  const storage = new Map();
  const client = profileClient(storage);
  await client.saveBillingProfile("buyer-1", fields);
  const [key, raw] = [...storage.entries()][0];
  const legacy = JSON.parse(raw);
  delete legacy.postcode;
  storage.set(key, JSON.stringify(legacy));
  const restored = await client.loadBillingProfile("buyer-1");
  assert.equal(restored.firstName, "Test");
  assert.equal(restored.address, "Test building");
  assert.equal(restored.postcode, "");
  await assert.rejects(
    client.saveBillingProfile("buyer-1", restored),
    /postal code/,
  );
});

test("pickup needs contact details while a confirmed delivery pin needs a street address without a postal-code gate", async () => {
  const client = profileClient();
  const contact = { ...fields, address: "", area: "", city: "", postcode: "" };
  assert.equal(
    client.validateBillingProfile(contact, { address: "none", postcode: false })
      .phone,
    "+254712345678",
  );
  assert.throws(
    () =>
      client.validateBillingProfile(contact, {
        address: "street",
        postcode: false,
      }),
    /building/,
  );
  const pinDelivery = { ...contact, address: "Confirmed building entrance" };
  await client.saveBillingProfile("buyer-1", pinDelivery, {
    address: "street",
    postcode: false,
  });
  assert.equal(
    (await client.loadBillingProfile("buyer-1")).address,
    pinDelivery.address,
  );
  assert.throws(
    () =>
      client.validateBillingProfile(
        { ...contact, phone: "bad" },
        { address: "none", postcode: false },
      ),
    /phone/,
  );
  assert.throws(
    () =>
      client.validateBillingProfile(
        { ...pinDelivery, postcode: "ABC" },
        { address: "street", postcode: false },
      ),
    /postal/,
  );
});
