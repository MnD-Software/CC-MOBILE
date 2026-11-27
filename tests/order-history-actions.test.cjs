const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const pause = () => new Promise((resolve) => setImmediate(resolve));
function history(status = "completed") {
  let cursor = 0,
    tree,
    requests = 0,
    added = 0,
    resolveRequest;
  const states = [],
    refs = [],
    routes = [];
  const jsx = (type, props) => ({ type, props });
  const order = {
    reference: "APP-TEST",
    status,
    payment_state: "completed",
    created_at: "2026-11-27T10:00:00Z",
    total_minor: 300000,
    items: [],
  };
  const react = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === "function" ? value(states[i]) : value;
        },
      ];
    },
    useRef: (value) => {
      const i = cursor++;
      return refs[i] ?? (refs[i] = { current: value });
    },
    useEffect: () => {},
  };
  const modules = {
    "@/components/storefront/GlassSurface": { GlassSurface: "GlassSurface" },
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View", Pressable: "Pressable" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@tanstack/react-query": {
      useInfiniteQuery: () => ({ data: { pages: [{ data: [order] }] } }),
    },
    "expo-router": {
      router: { push: (path) => routes.push(path), setParams() {} },
      useLocalSearchParams: () => ({ awaiting_receipt: "1" }),
    },
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "@/auth/AuthProvider": { useAuth: () => ({ customer: { id: "buyer" } }) },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/design/useScreenActive": { useScreenActive: () => true },
    "@/components/ui/Commerce": {
      Screen: "Screen",
      Feedback: "Feedback",
      Notice: "Notice",
      IconButton: "IconButton",
    },
    "@/components/ui/Typography": { Text: "Text" },
    "@/components/ui/Input": { Input: "Input" },
    "@/components/ui/Button": { Button: "Button" },
    "@/components/ui/Disclosure": { Disclosure: "Disclosure" },
    "@/components/ui/LoadingImage": { LoadingImage: "Image" },
    "@/components/ui/Skeleton": { Skeleton: "Skeleton" },
    "./app-media": { appMedia: (x) => x },
    "./app-orders": { appOrders: {} },
    "./ActiveOrderCard": { orderStageLabel: (x) => x },
    "./order-history": { orderHistoryAction: () => "View order" },
    "./OrderDateField": { OrderDateField: "Date" },
    "./contracts": { money: String },
    "./useHomeOrders": {
      useHomeOrders: () => ({}),
      useAcknowledgeOrder: () => ({}),
    },
    "@/native/haptics": { selectionFeedback() {} },
    "./TrackOrderAction": { TrackOrderAction: "Track" },
    "./store": {
      useBag: {
        getState: () => ({
          addBundle: () => {
            added++;
            return true;
          },
        }),
      },
    },
    "@/features/experience/ExperienceScreen": {
      repeatOrder: () => {
        requests++;
        return new Promise((resolve) => (resolveRequest = resolve));
      },
    },
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
      fs.readFileSync("src/features/commerce/OrdersHistoryScreen.tsx", "utf8"),
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
  function render() {
    cursor = 0;
    tree = context.exports.OrdersHistoryScreen();
    return tree;
  }
  function all(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((n) => (n ? all(n) : []));
    return [node, ...(node.props?.children ? all(node.props.children) : [])];
  }
  render();
  return {
    render,
    buttons: () => all().filter((n) => n.type === "Button"),
    resolve: () => resolveRequest([]),
    stats: () => ({ requests, added, routes }),
  };
}
test("completed history offers green View order and Reorder, with one in-flight reorder", async () => {
  const h = history();
  const view = h.buttons().find((b) => b.props.label === "View order"),
    repeat = h.buttons().find((b) => b.props.label === "Reorder");
  assert.equal(view.props.variant, "success");
  assert.ok(repeat);
  repeat.props.onPress();
  repeat.props.onPress();
  assert.equal(h.stats().requests, 1);
  h.render();
  assert.equal(
    h.buttons().find((b) => b.props.label === "Reorder").props.loading,
    true,
  );
  h.resolve();
  await pause();
  assert.equal(h.stats().added, 1);
  assert.deepEqual(h.stats().routes, ["/cart"]);
});
test("cancelled orders are not styled as completed and have no Reorder action", () => {
  const h = history("cancelled");
  assert.equal(
    h.buttons().find((b) => b.props.label === "View order").props.variant,
    "outline",
  );
  assert.ok(!h.buttons().some((b) => b.props.label === "Reorder"));
});
