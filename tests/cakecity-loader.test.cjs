const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function mount(reduced) {
  let cleanup,
    listener,
    starts = 0,
    stops = 0,
    removed = 0;
  const value = {
    setValue() {},
    interpolate() {
      return 0;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const native = {
    View: "View",
    Animated: {
      View: "AnimatedView",
      Value: function () {
        return value;
      },
      timing: () => ({}),
      sequence: () => ({}),
      loop: () => ({
        start() {
          starts++;
        },
        stop() {
          stops++;
        },
      }),
    },
    AppState: {
      currentState: "active",
      addEventListener(event, fn) {
        listener = fn;
        return {
          remove() {
            removed++;
          },
        };
      },
    },
  };
  const modules = {
    react: {
      useRef: (v) => ({ current: v }),
      useEffect: (fn) => {
        cleanup = fn();
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": native,
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "@/design/useReducedMotion": { useReducedMotion: () => reduced },
    "@/theme/ThemeProvider": {
      useTheme: () => ({ colors: { brandStrong: "#B80068" } }),
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
      fs.readFileSync("src/components/ui/CakeCityLoader.tsx", "utf8"),
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
  const tree = context.exports.CakeCityLoader({ size: "large" });
  return {
    tree,
    change: (state) => listener(state),
    cleanup: () => cleanup(),
    stats: () => ({ starts, stops, removed }),
  };
}
test("Cake City loader pauses in background, restarts on return and disposes its animation", () => {
  const c = mount(false);
  assert.equal(c.tree.props.accessibilityRole, "progressbar");
  assert.equal(c.tree.props.accessibilityState.busy, true);
  assert.equal(c.stats().starts, 1);
  c.change("background");
  assert.equal(c.stats().stops, 1);
  assert.equal(c.stats().starts, 1);
  c.change("active");
  assert.equal(c.stats().starts, 2);
  c.cleanup();
  assert.equal(c.stats().removed, 1);
  assert.ok(c.stats().stops >= 2);
});
test("Cake City loader remains still for reduced motion", () => {
  const c = mount(true);
  c.change("active");
  assert.equal(c.stats().starts, 0);
  c.cleanup();
});
