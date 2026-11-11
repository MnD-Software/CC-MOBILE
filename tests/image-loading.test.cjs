const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function photo() {
  let states = [],
    cursor = 0,
    identity,
    tree;
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    react: {
      createElement: (type, props, ...children) => ({
        type,
        key: props?.key,
        props: {
          ...props,
          children: children.length === 1 ? children[0] : children,
        },
      }),
      useEffect() {},
      useRef: () => ({ current: null }),
      useState: (initial) => {
        const target = states,
          index = cursor++;
        if (!(index in target)) target[index] = initial;
        return [
          target[index],
          (value) => {
            target[index] =
              typeof value === "function" ? value(target[index]) : value;
          },
        ];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "expo-image": { Image: "Image" },
    "react-native": {
      Platform: { OS: "ios" },
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { absoluteFill: { position: "absolute" } },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "./Skeleton": { Skeleton: "Skeleton" },
    "./Typography": { Text: "Text" },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
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
      fs.readFileSync("src/components/ui/LoadingImage.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  function render(props) {
    const request = context.exports.LoadingImage(props);
    if (identity !== request.key) {
      states = [];
      identity = request.key;
    }
    cursor = 0;
    tree = request.type(request.props);
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat()) {
      if (child === undefined) continue;
      const result = find(predicate, child);
      if (result) return result;
    }
    return null;
  }
  return { render, find };
}
test("a pending photo shows a skeleton until it is displayed", () => {
  const ui = photo(),
    props = { source: "https://images.example.com/cake.jpg" };
  ui.render(props);
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
  assert.equal(
    ui.find((n) => n.type === "Pressable"),
    null,
  );
  ui.find((n) => n.type === "Image").props.onDisplay();
  ui.render(props);
  assert.equal(
    ui.find((n) => n.props?.testID === "photo-loading"),
    null,
  );
});
test("failed photos offer an explicit retry and a known missing photo is never an endless loader", () => {
  const ui = photo(),
    props = { source: "https://images.example.com/cake.jpg" };
  ui.render(props);
  ui.find((n) => n.type === "Image").props.onError({});
  ui.render(props);
  const retry = ui.find(
    (n) => n.props?.accessibilityLabel === "Retry loading photo",
  );
  assert.ok(retry);
  retry.props.onPress();
  ui.render(props);
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
  assert.equal(ui.find((n) => n.type === "Image").key, 1);
  ui.render({ source: null });
  assert.equal(
    ui.find((n) => n.props?.testID === "photo-loading"),
    null,
  );
  assert.ok(
    ui.find((n) => n.props?.accessibilityLabel === "Photo coming soon"),
  );
});
test("recycled image views ignore a late display callback from the previous product", () => {
  const ui = photo();
  ui.render({
    source: "https://images.example.com/first.jpg",
    recyclingKey: "first",
  });
  const oldDisplay = ui.find((n) => n.type === "Image").props.onDisplay;
  const next = {
    source: "https://images.example.com/next.jpg",
    recyclingKey: "next",
  };
  ui.render(next);
  oldDisplay();
  ui.render(next);
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
});
