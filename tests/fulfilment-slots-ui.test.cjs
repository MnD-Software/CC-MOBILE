const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function render(data, value = "") {
  const selected = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useState: (value) => [value, () => {}] },
    "@/components/ui/Button": { Button: "Button" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View", Pressable: "Pressable" },
    "@tanstack/react-query": {
      useQuery: () => ({ data, isPending: false, isError: false }),
    },
    "@/api/client": { api: {} },
    "@/auth/AuthProvider": { useAuth: () => ({ customer: { id: "owner" } }) },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/components/ui/Typography": { Text: "Text" },
    "@/components/ui/Disclosure": { Disclosure: "Disclosure" },
    "@/components/ui/Commerce": { Feedback: "Feedback" },
  };
  const ctx = {
    exports: {},
    require: (n) => {
      assert(n in modules, n);
      return modules[n];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/experience/FulfilmentSlots.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    ctx,
  );
  const tree = ctx.exports.FulfilmentSlots({
    fulfilment: "pickup",
    value,
    onChange: (id) => selected.push(id),
  });
  const walk = (n) =>
    !n || typeof n !== "object"
      ? []
      : Array.isArray(n)
        ? n.flatMap(walk)
        : [n, ...walk(n.props?.children)];
  return { nodes: walk(tree), selected };
}
const slot = {
  id: "one",
  label: "Afternoon",
  starts_at: "2026-12-01T12:00:00+03:00",
  ends_at: "2026-12-01T14:00:00+03:00",
  remaining: 1,
  full: false,
  booking_closed: false,
};
test("full and closed windows remain visible, disabled, and cannot offer an unrestricted alternative", () => {
  const result = render([
    { ...slot, id: "full", remaining: 0, full: true },
    { ...slot, id: "closed", booking_closed: true },
  ]);
  const choices = result.nodes.filter((n) => n.type === "Pressable");
  assert.equal(choices.length, 2);
  assert(
    choices.every(
      (n) => n.props.disabled && n.props.accessibilityState.disabled,
    ),
  );
  assert(
    result.nodes.some(
      (n) => n.props?.children === "Full - choose another window",
    ),
  );
  assert(result.nodes.some((n) => n.props?.children === "Booking closed"));
  assert(
    !result.nodes.some((n) => n.props?.children === "No preferred window"),
  );
});
test("available window selection sends its actual identity", () => {
  const result = render([slot]);
  const choice = result.nodes.find((n) => n.type === "Pressable");
  assert.equal(choice.props.disabled, false);
  choice.props.onPress();
  assert.deepEqual(result.selected, ["one"]);
});
