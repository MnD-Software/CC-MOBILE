const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const pause = () => new Promise((resolve) => setImmediate(resolve));
function mount() {
  let cursor = 0,
    started = 0,
    requested = 0,
    resolveRequest;
  const states = [],
    refs = [],
    deps = [],
    effects = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useState: (v) => {
        const i = cursor++;
        if (!(i in states)) states[i] = v;
        return [states[i], (x) => (states[i] = x)];
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
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      Pressable: "Pressable",
      Animated: {
        View: "AnimatedView",
        Value: function () {
          return {
            setValue() {},
            interpolate() {
              return 0;
            },
          };
        },
        timing: () => ({}),
        loop: () => ({
          start() {
            started++;
          },
          stop() {},
        }),
      },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@/design/useReducedMotion": { useReducedMotion: () => false },
  };
  const context = { exports: {}, require: (name) => modules[name] };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/OrderRefreshButton.tsx", "utf8"),
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
  function render(refreshing = false) {
    cursor = 0;
    const tree = context.exports.OrderRefreshButton({
      refreshing,
      refresh: () => {
        requested++;
        return new Promise((resolve) => (resolveRequest = resolve));
      },
    });
    while (effects.length) effects.shift()();
    return tree;
  }
  return {
    render,
    stats: () => ({ started, requested }),
    resolve: () => resolveRequest(),
  };
}
test("background tracking polling stays still; deliberate refresh keeps the same icon and runs once", async () => {
  const c = mount();
  c.render(true);
  assert.equal(c.stats().started, 0);
  const button = c.render();
  button.props.onPress();
  button.props.onPress();
  await pause();
  assert.equal(c.stats().requested, 1);
  let tree = c.render(true);
  assert.equal(tree.props.accessibilityState.busy, true);
  assert.equal(c.stats().started, 1);
  assert.equal(tree.props.children.props.children.type, "Icon");
  assert.equal(
    tree.props.children.props.children.props.name,
    "refresh-outline",
  );
  c.resolve();
  await pause();
  tree = c.render();
  assert.equal(tree.props.accessibilityState.busy, false);
});
