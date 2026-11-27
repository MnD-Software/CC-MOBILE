const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
function load() {
  const jsx = (type, props) => ({ type, props });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "react-native": { Pressable: "Pressable", View: "View" },
    "@/components/storefront/GlassSurface": { GlassSurface: "GlassSurface" },
    "@/theme/ThemeProvider": {
      useTheme: () => ({
        colors: {
          success: "green",
          successLight: "palegreen",
          brandStrong: "pink",
          brandLight: "palepink",
          surface: "white",
          ink: "black",
          muted: "grey",
        },
      }),
    },
    "@/theme/tokens": { tokens: { shadow: { subtle: {} } } },
    "./Typography": { Text: "Text" },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/components/ui/NotificationCard.tsx", "utf8"),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return context.exports;
}
test("delivery and dispatch updates never imply completion until confirmed", () => {
  const { notificationPresentation: p } = load();
  for (const kind of ["delivery_delayed", "dispatch_assigned", "rider_started"])
    assert.equal(p({ kind }).success, false);
  for (const kind of [
    "order_delivered",
    "customer_received",
    "order_completed",
  ])
    assert.equal(p({ kind }).success, true);
  assert.equal(p({ kind: "kitchen_ready" }).label, "From the kitchen");
});
test("an inbox card has one accessible action, unread status and a full message", () => {
  const { NotificationCard } = load();
  let opened = 0;
  const props = {
    item: {
      id: "n1",
      title: "Cake ready",
      body: "Your cake is ready to collect.",
      read_at: null,
      created_at: "invalid",
      data: { kind: "kitchen_ready", reference: "APP-1" },
    },
    onPress: () => opened++,
  };
  const tree = NotificationCard(props);
  assert.equal(tree.props.accessibilityRole, "button");
  assert.match(
    tree.props.accessibilityLabel,
    /Unread.*Cake ready.*ready to collect/,
  );
  assert.ok(!JSON.stringify(tree).includes("Invalid Date"));
  tree.props.onPress();
  assert.equal(opened, 1);
  assert.equal(
    NotificationCard({ ...props, disabled: true }).props.disabled,
    true,
  );
});
