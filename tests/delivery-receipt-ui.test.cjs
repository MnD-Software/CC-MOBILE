const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { View, Text } = require("react-native-web");

function render(received) {
  let reviewEnabled;
  const modules = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": { View },
    "@expo/vector-icons": { Ionicons: () => null },
    "expo-linear-gradient": { LinearGradient: View },
    "expo-router": { router: { push() {} } },
    "@tanstack/react-query": {
      useQuery(options) {
        reviewEnabled = options.enabled;
        return { data: null, isPending: false };
      },
    },
    zod: require("zod"),
    "@/api/client": { api: {} },
    "@/auth/AuthProvider": { useAuth: () => ({ customer: { id: "buyer" } }) },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/components/ui/Button": {
      Button: ({ label }) => React.createElement(Text, null, label),
    },
    "@/components/ui/Input": {
      Input: ({ label }) => React.createElement(Text, null, label),
    },
    "@/components/ui/Commerce": {
      Notice: ({ message }) => React.createElement(Text, null, message),
    },
    "@/components/ui/Typography": { Text },
    "./useHomeOrders": { useAcknowledgeOrder: () => ({ isPending: false }) },
  };
  const context = {
    exports: {},
    require(name) {
      assert.ok(name in modules, name);
      return modules[name];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/DeliveryComplete.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    context,
  );
  const html = renderToStaticMarkup(
    React.createElement(context.exports.DeliveryComplete, {
      order: {
        reference: "APP-1",
        status: "completed",
        payment_state: "completed",
        paid_at: "2026-11-13T06:00:00Z",
        received_at: received ? "2026-11-13T07:00:00Z" : null,
        snapshot: { checkout: { fulfilment: "delivery" } },
      },
    }),
  );
  return { html, reviewEnabled };
}

test("customer must confirm receipt before a satisfaction prompt is offered", () => {
  const before = render(false);
  assert.match(before.html, /I&#x27;ve received my cake|I've received my cake/);
  assert.match(before.html, /Something isn/);
  assert.doesNotMatch(before.html, /Send feedback/);
  assert.equal(before.reviewEnabled, false);
  const after = render(true);
  assert.match(after.html, /How was your experience/);
  assert.match(after.html, /Send feedback/);
  assert.doesNotMatch(after.html, /I've received my cake/);
  assert.equal(after.reviewEnabled, true);
});
