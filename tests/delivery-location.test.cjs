const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");

// Execute the real async handlers with controlled native responses so a slow
// GPS lookup cannot silently replace a customer's chosen destination.
const source = ts.createSourceFile(
  "picker.tsx",
  fs.readFileSync("src/features/commerce/DeliveryLocationPicker.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const extracted = [];
function visit(node) {
  if (
    ts.isFunctionDeclaration(node) &&
    ["permission", "locate"].includes(node.name?.text)
  )
    extracted.push(node.getText(source));
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "signature"
  )
    extracted.push("const " + node.getText(source) + ";");
  ts.forEachChild(node, visit);
}
visit(source);
const javascript = ts.transpileModule(extracted.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(overrides = {}) {
  const changes = [],
    notices = [],
    calls = [];
  const props = {
    address: "",
    area: "",
    city: "Nairobi",
    isGift: false,
    onChange: (value) => changes.push(value),
  };
  const context = {
    props,
    latest: { current: props },
    alive: { current: true },
    request: { current: 0 },
    setBusy() {},
    setNotice: (value) => notices.push(value),
    setTimeout,
    clearTimeout,
    locationAddressSuggestion: (value) => value,
    Location: {
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: async () => ({
        status: "granted",
        canAskAgain: true,
      }),
      requestForegroundPermissionsAsync: async () => {
        calls.push("request");
        return { status: "granted" };
      },
      hasServicesEnabledAsync: async () => true,
      getLastKnownPositionAsync: async () => {
        calls.push("position");
        return { coords: { latitude: 1, longitude: 2 } };
      },
      reverseGeocodeAsync: async () => [
        { address: "New street", area: "Westlands", city: "Nairobi" },
      ],
      ...overrides,
    },
  };
  vm.createContext(context);
  vm.runInContext(javascript + "globalThis.run = locate;", context);
  return { context, changes, notices, calls };
}

test("current foreground location fills editable delivery fields", async () => {
  const value = setup();
  await value.context.run(true);
  assert.equal(value.changes.length, 1);
  assert.equal(value.changes[0].address, "New street");
});

test("late GPS results preserve edited addresses, gifts and newer selections", async () => {
  for (const change of [
    (ctx) => {
      ctx.latest.current = { ...ctx.props, address: "Chosen address" };
    },
    (ctx) => {
      ctx.latest.current = { ...ctx.props, isGift: true };
    },
    (ctx) => {
      ctx.request.current++;
    },
    (ctx) => {
      ctx.alive.current = false;
    },
  ]) {
    let release;
    const value = setup({
      reverseGeocodeAsync: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = value.context.run();
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    change(value.context);
    release([{ address: "Stale street", area: "Westlands", city: "Nairobi" }]);
    await pending;
    assert.equal(value.changes.length, 0);
  }
});

test("automatic location respects a previous denial without reprompting", async () => {
  const value = setup({
    getForegroundPermissionsAsync: async () => ({
      status: "denied",
      canAskAgain: true,
    }),
  });
  await value.context.run(true);
  assert.deepEqual(value.calls, []);
  assert.equal(value.changes.length, 0);
  assert.match(value.notices.at(-1), /Allow location access/);
});

test("disabled location services leave the destination untouched", async () => {
  const value = setup({ hasServicesEnabledAsync: async () => false });
  await value.context.run();
  assert.deepEqual(value.calls, []);
  assert.equal(value.changes.length, 0);
  assert.match(value.notices.at(-1), /Turn on location services/);
});
