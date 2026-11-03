const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { View, Text } = require("react-native-web");

function renderCheckout(
  enabled,
  query = { data: { available: false }, isPending: false },
) {
  const source = ts.transpileModule(
    fs.readFileSync("src/features/commerce/CheckoutScreen.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const context = {
    exports: {},
    process: { env: {} },
    require(name) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@tanstack/react-query") return { useQuery: () => query };
      if (name === "./pesapal-checkout")
        return { loadPesapalConfiguration() {} };
      if (name === "./PesapalCheckoutForm")
        return {
          PesapalCheckoutForm: () =>
            React.createElement(Text, null, "Real provider checkout form"),
        };
      if (name === "expo-router") return { router: { push() {} } };
      if (name.endsWith("/Button"))
        return {
          Button: ({ label }) => React.createElement(Text, null, label),
        };
      if (name.endsWith("/Commerce"))
        return {
          Screen: ({ title, children }) =>
            React.createElement(
              View,
              null,
              React.createElement(Text, null, title),
              children,
            ),
          Notice: ({ message }) => React.createElement(Text, null, message),
          Feedback: ({ loading, error }) =>
            React.createElement(
              Text,
              null,
              loading ? "Loading payment setup" : error?.message,
            ),
        };
      if (name.endsWith("/PurchaseTestScreen"))
        return {
          PurchaseTestScreen: ({ fromCheckout }) => {
            assert.equal(fromCheckout, true);
            return React.createElement(
              Text,
              null,
              "Independent simulated checkout",
            );
          },
        };
      if (name.endsWith("/client"))
        return {
          purchaseTestOrigin: () =>
            enabled ? "http://192.168.1.2:8011" : null,
        };
      throw new Error("Unexpected checkout dependency: " + name);
    },
  };
  vm.runInNewContext(source, context);
  return renderToStaticMarkup(
    React.createElement(context.exports.CheckoutScreen),
  );
}

test("normal checkout ignores stale simulator configuration", () => {
  const html = renderCheckout(true, {
    data: { available: true, environment: "live" },
  });
  assert.match(html, /Real provider checkout form/);
  assert.doesNotMatch(html, /Independent simulated checkout|access code/i);
  assert.doesNotMatch(html, /website|href=/i);
});

test("unconfigured in-app payments preserve the bag and expose no website fallback", () => {
  const html = renderCheckout(false);
  assert.match(html, /In-app payments are not available right now/);
  assert.match(html, /Your shopping bag has been kept/);
  assert.match(html, /Manage billing details/);
  assert.doesNotMatch(html, /website|href=|Real provider checkout form/i);
});

test("configured live payments render the provider form", () => {
  const html = renderCheckout(false, {
    data: { available: true, environment: "live" },
  });
  assert.match(html, /Real provider checkout form/);
  assert.doesNotMatch(html, /simulated|sandbox|not available/i);
});

test("sandbox payment configuration is visibly labelled", () => {
  const html = renderCheckout(false, {
    data: { available: true, environment: "sandbox" },
  });
  assert.match(html, /Pesapal sandbox: test payments only/);
});

test("configuration network errors never expose a payment form", () => {
  const html = renderCheckout(false, {
    isError: true,
    error: new Error("Cannot connect"),
  });
  assert.match(html, /Cannot connect/);
  assert.doesNotMatch(html, /Real provider checkout form/);
});
