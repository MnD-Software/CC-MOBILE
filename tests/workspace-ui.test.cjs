require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const native = require("react-native-web");
const contracts = require("../src/features/workspace/contracts.ts");

function render(screen, customer, states = {}) {
  const queries = [];
  const code = ts.transpileModule(
    fs.readFileSync(`src/features/workspace/${screen}.tsx`, "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name === "react-native") return native;
      if (name === "expo-crypto")
        return { randomUUID: () => "test-request-unique-id" };
      if (name === "expo-router") return { router: { push() {} } };
      if (name.endsWith("/AuthProvider"))
        return { useAuth: () => ({ customer }) };
      if (name.endsWith("/client"))
        return {
          api: {
            get() {
              throw new Error("No network in renderer tests");
            },
          },
        };
      if (name === "@tanstack/react-query")
        return {
          useQuery(options) {
            queries.push(options);
            return {
              isPending: false,
              isError: false,
              ...states[options.queryKey[0]],
              refetch() {},
            };
          },
          useMutation: () => ({
            isPending: false,
            isError: false,
            mutate() {},
          }),
          useQueryClient: () => ({ invalidateQueries() {} }),
        };
      if (name.endsWith("/Typography")) return { Text: native.Text };
      if (name.endsWith("/Button"))
        return {
          Button: ({ label, disabled }) =>
            React.createElement("button", { disabled }, label),
        };
      if (name.endsWith("/Input"))
        return {
          Input: ({ label }) => React.createElement("label", null, label),
        };
      if (name.endsWith("/Commerce"))
        return {
          Screen: ({ title, children }) =>
            React.createElement("main", null, title, children),
          Notice: ({ message }) => React.createElement("p", null, message),
          ui: {},
        };
      if (name.endsWith("/ThemeProvider"))
        return { useThemedStyles: () => ({}) };
      if (name === "./contracts") return contracts;
      return require(name);
    },
  };
  vm.runInNewContext(code, context);
  return {
    html: renderToStaticMarkup(React.createElement(context.exports[screen])),
    queries,
  };
}
test("guest corporate and team screens do not request private data", () => {
  for (const screen of ["CorporateScreen", "CommandCenterScreen"]) {
    const { html, queries } = render(screen, null);
    assert.match(html, /Sign in/);
    assert.equal(queries.length, 0);
  }
});
test("ordinary accounts cannot see team operations and finance cannot view customer queue", () => {
  const buyer = render(
    "CommandCenterScreen",
    { id: "buyer" },
    { "workspace-access": { data: { role: "customer", permissions: [] } } },
  );
  assert.match(buyer.html, /no Command Center permissions/);
  assert.doesNotMatch(buyer.html, /Reply to customer/);
  const finance = render(
    "CommandCenterScreen",
    { id: "finance" },
    {
      "workspace-access": {
        data: { role: "finance", permissions: ["audit.read"] },
      },
      "workspace-audit": { data: [] },
    },
  );
  assert.match(finance.html, /Recent audit events/);
  assert.doesNotMatch(finance.html, /Search requests|Prepare quotation/);
  assert.ok(
    finance.queries.every((query) => query.queryKey.includes("finance")),
  );
});
test("corporate screen renders genuine empty and failed loading states without demo companies", () => {
  const empty = render(
    "CorporateScreen",
    { id: "customer-a" },
    { "corporate-organizations": { data: [] } },
  );
  assert.match(empty.html, /Register a company or accept an invitation/);
  assert.ok(
    empty.queries.every((query) => query.queryKey.includes("customer-a")),
  );
  const failed = render(
    "CorporateScreen",
    { id: "customer-a" },
    {
      "corporate-organizations": {
        isError: true,
        error: new Error("Corporate service unavailable"),
      },
    },
  );
  assert.match(failed.html, /Corporate service unavailable/);
  assert.doesNotMatch(failed.html, /Open company/);
});
