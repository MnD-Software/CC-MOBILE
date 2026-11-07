const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function pickup() {
  const states = [],
    refs = [],
    deps = [],
    effects = [],
    calls = [],
    confirmed = [];
  let cursor = 0,
    tree;
  const options = {
    enabled: true,
    maps_ready: true,
    map_picker_ready: false,
    origin_name: "HQ",
    origin_address: "HQ address",
    radius_km: 30,
    pickup_stores: [
      { id: "branch", name: "Branch collection", address: "Branch address" },
    ],
  };
  const react = {
    useState: (v) => {
      const i = cursor++;
      if (!(i in states)) states[i] = v;
      return [
        states[i],
        (value) =>
          (states[i] = typeof value === "function" ? value(states[i]) : value),
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
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View" },
    "expo-location": {},
    "@/components/ui/Input": { Input: "Input" },
    "@/components/ui/Button": { Button: "Button" },
    "@/components/ui/Commerce": { Notice: "Notice" },
    "@/components/ui/Disclosure": { Disclosure: "Disclosure" },
    "@/components/ui/Typography": { Text: "Text" },
    "./DeliveryMap": { DeliveryMap: "Map" },
    "./contracts": { money: (v) => `KES ${v}` },
    "./app-delivery": {
      appDelivery: {
        quote: async (mode, point, branch) => {
          calls.push({ mode, point, branch });
          return {
            id: branch,
            rate: branch === "hq" ? "Free HQ pickup" : "50% transfer",
            fee_minor: branch === "hq" ? 0 : 13250,
            distance_meters: 5500,
            expires_at: "2026-11-07T12:00:00Z",
          };
        },
      },
    },
  };
  const ctx = {
    exports: {},
    require: (name) => {
      if (name in modules) return modules[name];
      throw Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/HqDeliveryPicker.tsx", "utf8"),
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
    tree = ctx.exports.HqDeliveryPicker({
      options,
      fulfilment: "pickup",
      onChange: (q) => confirmed.push(q),
      onAddressSelect() {},
    });
    while (effects.length) effects.shift()();
  }
  function visit(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(visit);
    return [
      ...(node.type === "Button" ? [node] : []),
      ...visit(node.props?.children),
    ];
  }
  return {
    calls,
    confirmed,
    buttons: () => visit(tree),
    flush: async () => {
      for (let i = 0; i < 4; i++) {
        render();
        await tick();
      }
    },
  };
}
test("HQ and branch pickup calculate their server quote automatically without another confirmation button", async () => {
  const ui = pickup();
  await ui.flush();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].branch, "hq");
  assert.equal(ui.confirmed.at(-1).fee_minor, 0);
  assert(
    !ui
      .buttons()
      .some((b) => /Confirm pickup|Retry pickup/.test(b.props.label)),
  );
  ui.buttons()
    .find((b) => b.props.label === "Branch collection")
    .props.onPress();
  assert.equal(ui.confirmed.at(-1), null);
  await ui.flush();
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].branch, "branch");
  assert.equal(ui.confirmed.at(-1).fee_minor, 13250);
  ui.buttons()
    .find((b) => b.props.label === "Branch collection")
    .props.onPress();
  await ui.flush();
  assert.equal(ui.calls.length, 3);
  assert.equal(ui.confirmed.at(-1).fee_minor, 13250);
  assert(
    !ui
      .buttons()
      .some((b) => /Confirm pickup|Retry pickup/.test(b.props.label)),
  );
});
