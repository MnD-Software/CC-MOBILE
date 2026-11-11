const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

test("payment confetti waits for the accessibility preference before animating or finishing", () => {
  const source = ts.transpileModule(
    fs.readFileSync("src/features/commerce/PaymentConfetti.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  let preference = { reduceMotion: true, isResolved: false };
  let effect,
    animated = 0,
    completed = 0;
  class Value {
    interpolate() {
      return 0;
    }
  }
  const modules = {
    "@/components/ui/ConfettiLayer": { useConfettiLayer: () => null },
    "@/components/ui/ConfettiBurst": { ConfettiBurst: "ConfettiBurst" },
    react: {
      useEffect: (fn) => {
        effect = fn;
      },
      useRef: (value) => ({ current: value }),
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "react-native": {
      Animated: {
        Value,
        View: "View",
        timing: () => ({
          start() {
            animated++;
          },
          stop() {},
        }),
      },
      Easing: { out: (value) => value, quad: 0 },
      Platform: { OS: "web" },
      StyleSheet: { absoluteFill: {} },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      View: "View",
    },
    "@/design/useReducedMotion": {
      useMotionAccessibilityPreference: () => preference,
    },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
  };
  vm.runInNewContext(source, context);
  const render = () => {
    context.exports.PaymentConfetti({ onComplete: () => completed++ });
    effect();
  };
  render();
  assert.equal(animated, 0);
  assert.equal(completed, 0);
  preference = { reduceMotion: false, isResolved: true };
  render();
  assert.equal(animated, 1);
  assert.equal(completed, 0);
  preference = { reduceMotion: true, isResolved: true };
  render();
  assert.equal(animated, 1);
  assert.equal(completed, 1);
});
