const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function screen(coupons, code = "") {
  const changes = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useEffect() {},
      useRef(value) {
        return { current: value };
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@tanstack/react-query": { useQuery: () => ({ data: { coupons } }) },
    "react-native": { Pressable: "Checkbox", View: "View" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    zod: require("zod"),
    "@/api/client": { api: { post: async () => ({ coupons }) } },
    "@/components/ui/Typography": { Text: "Text" },
    "@/components/ui/Skeleton": { Skeleton: "Skeleton" },
    "@/components/ui/Input": { Input: "Input" },
    "@/components/ui/Disclosure": { Disclosure: "Disclosure" },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "./coupon-wallet": { useCouponWallet: () => ({ codes: [], ready: true }) },
    "./contracts": { money: (value) => `KSh ${value}` },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(modules[name], name);
      return modules[name];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/CheckoutCoupons.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    context,
  );
  const tree = context.exports.CheckoutCoupons({
    owner: "member-a",
    subtotalMinor: 250000,
    code,
    onChange: (value) => changes.push(value),
  });
  function find(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "Checkbox") return node;
    for (const child of [node.props?.children].flat(2)) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  }
  return { checkbox: find(tree), changes };
}
const reward = {
  code: "club-reward",
  amount_minor: 10000,
  minimum_minor: 100000,
  eligible: true,
  remaining_to_minimum_minor: 0,
};
test("an eligible reward is offered without spending it and its checkbox can apply or remove it", () => {
  const offered = screen([reward]);
  assert.equal(offered.changes.length, 0);
  assert.equal(offered.checkbox.props.accessibilityState.checked, false);
  offered.checkbox.props.onPress();
  assert.deepEqual(offered.changes, ["club-reward"]);
  const selected = screen([reward], "club-reward");
  assert.equal(selected.checkbox.props.accessibilityState.checked, true);
  selected.checkbox.props.onPress();
  assert.deepEqual(selected.changes, [""]);
});
test("a reward below the minimum spend is visible but cannot be selected", () => {
  const offered = screen([
    { ...reward, eligible: false, remaining_to_minimum_minor: 50000 },
  ]);
  assert.equal(offered.checkbox.props.disabled, true);
  assert.equal(offered.changes.length, 0);
});
