const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function homeSearch() {
  let query = "",
    tree,
    request = 0;
  const routes = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useState: () => [
        query,
        (next) => {
          query = next;
        },
      ],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      Pressable: "Pressable",
      TextInput: "TextInput",
      View: "View",
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-router": { router: { navigate: (route) => routes.push(route) } },
    "@/components/storefront/GlassSurface": { GlassSurface: "Surface" },
    "@/theme/tokens": { tokens: { color: { border: "#eee" } } },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
  };
  const context = {
    exports: {},
    Date: { now: () => ++request },
    require: (name) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/HomeSearchBar.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    context,
  );
  function find(node, type) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    for (const child of [node.props?.children].flat()) {
      const found = find(child, type);
      if (found) return found;
    }
  }
  const render = () => {
    tree = context.exports.HomeSearchBar();
  };
  render();
  return {
    routes,
    input: () => find(tree, "TextInput").props,
    type: (value) => {
      find(tree, "TextInput").props.onChangeText(value);
      render();
    },
    press: () => find(tree, "Pressable").props.onPress(),
  };
}

test("Home accepts a query and keyboard Search sends the full trimmed query to results", () => {
  const ui = homeSearch();
  ui.type("  black forest cake  ");
  assert.equal(ui.input().value, "  black forest cake  ");
  assert.equal(ui.input().returnKeyType, "search");
  ui.input().onSubmitEditing();
  assert.equal(ui.routes[0].pathname, "/(tabs)/search");
  assert.equal(ui.routes[0].params.search, "black forest cake");
});

test("Home search button opens results, clears a previous query and supports repeating a search", () => {
  const ui = homeSearch();
  ui.type("Vanilla");
  ui.press();
  ui.press();
  assert.equal(ui.routes[1].params.search, "Vanilla");
  assert.notEqual(
    ui.routes[0].params.searchRequest,
    ui.routes[1].params.searchRequest,
  );
  ui.type("   ");
  ui.press();
  assert.equal(ui.routes[2].params.search, "");
  assert.equal(ui.routes[2].params.focus, "1");
});
