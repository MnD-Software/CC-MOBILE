const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(code, modules) {
  const context = {
    exports: {},
    __DEV__: true,
    console,
    require(name) {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  };
  vm.runInNewContext(code, context);
  return context.exports;
}

function declarations() {
  const jsx = (type, props) => ({ type, props });
  const layout = load(
    ts.transpileModule(fs.readFileSync("app/(tabs)/_layout.tsx", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@expo/vector-icons": { Ionicons: {} },
      "expo-blur": { BlurView: "BlurView" },
      "expo-router": {
        Tabs: Object.assign(() => {}, { Screen: "Screen" }),
        Redirect: "Redirect",
      },
      "@/auth/AuthProvider": {
        useAuth: () => ({ customer: { role: "customer" }, restoring: false }),
      },
      "@/auth/staff-routing": { isStaffRole: () => false },
      "react-native": {
        Platform: { OS: "ios" },
        StyleSheet: { create: (x) => x },
      },
      "react-native-safe-area-context": {
        useSafeAreaInsets: () => ({ bottom: 0 }),
      },
      "@/theme/tokens": { tokens: { color: {} } },
    },
  );
  const tree = layout.default();
  assert.equal(
    tree.props.tabBar(),
    null,
    "The app's separate floating bar owns visible navigation",
  );
  return tree.props.children
    .filter((x) => x?.type === "Screen")
    .map((x) => x.props);
}

// Exercise the installed Router's conversion and redirect policy, not a copy
// of those rules. This catches SDK changes that invalidate tab configuration.
function redirectFor(screens, target) {
  const tabs = load(
    fs.readFileSync(
      "node_modules/expo-router/build/layouts/TabsClient.js",
      "utf8",
    ),
    {
      "../link/Link": {},
      "../react-navigation/bottom-tabs/navigators/createBottomTabNavigator": {},
      "../react-navigation/native": {},
      "../standard-navigation": {
        integrateWithRouter: (_a, _b, config) => config,
      },
      "../standard-navigation/appendMissingPlaceholderTabRoutes": {},
      "./createBaseTabProps": {},
      "../react-navigation/bottom-tabs": {},
    },
  ).default;
  const configured = tabs.processScreens(screens);
  const routes = configured.map((s) => ({ name: s.name, key: s.name }));
  const descriptors = Object.fromEntries(
    configured.map((s) => [
      s.name,
      { options: s.options, routeSource: "layout" },
    ]),
  );
  const redirects = [];
  const policy = load(
    fs.readFileSync(
      "node_modules/expo-router/build/standard-navigation/useVisibleTabsWithRedirect.js",
      "utf8",
    ),
    {
      react: { useMemo: (fn) => fn(), useEffect: (fn) => fn() },
      "../Route": { useRouteNode: () => ({}) },
      "../constants": { NOT_FOUND_ROUTE_NAME: "+not-found" },
      "../global-state/useRouterActions": {
        useRouterActions: () => ({ replace: (href) => redirects.push(href) }),
      },
      "../layouts/GuardContext": { useGuardRedirect: () => undefined },
      "../link/preview/PreviewRouteContext": { useIsPreview: () => false },
      "../react-navigation/native": { useIsFocused: () => true },
      "../routeNode": { getValidInitialRouteName: () => "index" },
      "../utils/orderRoutesByRouteNames": {
        orderRoutesByRouteNames: (routes) => routes,
      },
      "./useBuildHref": { useBuildHref: () => (route) => `/${route.name}` },
    },
  );
  const state = policy.useVisibleTabsWithRedirect({
    routes,
    routeNames: routes.map((r) => r.name),
    focusedRouteKey: target,
    descriptors,
  });
  return { state, redirects };
}

test("DIY and search remain focused when opened from app buttons on the installed Expo Router", () => {
  for (const target of ["custom", "search"]) {
    const { state, redirects } = redirectFor(declarations(), target);
    assert.ok(state.focusedIndex >= 0, `${target} must remain reachable`);
    assert.deepEqual(redirects, []);
  }
});

test("regression reproduces the hidden-tab redirect that made DIY taps appear to do nothing", () => {
  const old = declarations().map((screen) =>
    screen.name === "custom" ? { ...screen, options: { href: null } } : screen,
  );
  const { state, redirects } = redirectFor(old, "custom");
  assert.equal(state.focusedIndex, -1);
  assert.deepEqual(redirects, ["/index"]);
});
