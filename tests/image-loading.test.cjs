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
  let effects = [],
    pending = [],
    timers = new Map(),
    nextTimer = 0;
  let appStateListener;
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
      useEffect(callback, deps) {
        const index = cursor++;
        const previous = effects[index];
        if (previous && deps?.every((value, i) => value === previous.deps?.[i]))
          return;
        pending.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: callback() };
        });
      },
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
      AppState: {
        addEventListener: (_, callback) => {
          appStateListener = callback;
          return { remove() {} };
        },
      },
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { absoluteFill: { position: "absolute" } },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "./Skeleton": { Skeleton: "Skeleton" },
    "./Typography": { Text: "Text" },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/platform/connectivity": {
      subscribeToConnectivity: () => () => {},
      connectivityState: () => "online",
    },
    "@/features/commerce/app-media": { appMedia: (value) => value },
  };
  const context = {
    exports: {},
    setTimeout: (callback) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
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
      for (const effect of effects) effect?.cleanup?.();
      effects = [];
      states = [];
      identity = request.key;
    }
    cursor = 0;
    tree = request.type(request.props);
    for (const callback of pending) callback();
    pending = [];
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
  return {
    render,
    find,
    resume: () => appStateListener?.("active"),
    retry: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
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
test("failed photos retry automatically beneath the skeleton without a customer retry button", () => {
  const ui = photo(),
    props = { source: "https://images.example.com/cake.jpg" };
  ui.render(props);
  ui.find((n) => n.type === "Image").props.onError({});
  ui.render(props);
  assert.equal(
    ui.find((n) => n.type === "Pressable"),
    null,
  );
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
  ui.retry();
  ui.render(props);
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
  assert.equal(ui.find((n) => n.type === "Image").key, 1);
  assert.equal(ui.find((n) => n.type === "Image").props.cachePolicy, "none");
  ui.render({ source: null });
  assert.equal(
    ui.find((n) => n.props?.testID === "photo-loading"),
    null,
  );
  assert.ok(
    ui.find((n) => n.props?.accessibilityLabel === "Photo coming soon"),
  );
});

test("permanent image failures stop the shimmer after bounded retries and resume automatically on foreground", () => {
  const ui = photo(),
    props = { source: "https://images.example.com/missing.jpg" };
  ui.render(props);
  for (let attempt = 0; attempt < 4; attempt++) {
    ui.find((n) => n.type === "Image").props.onError({});
    ui.render(props);
    if (attempt < 3) {
      ui.retry();
      ui.render(props);
    }
  }
  assert.equal(
    ui.find((n) => n.props?.testID === "photo-loading"),
    null,
  );
  assert.ok(
    ui.find(
      (n) => n.props?.accessibilityLabel === "Photo temporarily unavailable",
    ),
  );
  ui.resume();
  ui.render(props);
  assert.ok(ui.find((n) => n.type === "Image"));
  assert.ok(ui.find((n) => n.props?.testID === "photo-loading"));
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
