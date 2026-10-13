const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { View, Text, Pressable } = require("react-native-web");

function component(file, name, globals) {
  const tree = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const node = tree.statements.find(
    (value) => ts.isFunctionDeclaration(value) && value.name?.text === name,
  );
  assert.ok(node);
  const source = ts.transpileModule(
    node.getText(tree).replace(/^export /, "") +
      `\nexports.Component = ${name};`,
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
    require,
    View,
    Text,
    Pressable,
    useState: React.useState,
    Ionicons: () => null,
    ...globals,
  };
  vm.runInNewContext(source, context);
  return context.exports.Component;
}

test("appearance and disclosure expose checked and expanded state through the real web renderer", () => {
  const Appearance = component(
    "src/features/account/AccountScreen.tsx",
    "AppearanceSelector",
    {
      baseStyles: {},
      useThemedStyles: () => ({}),
      useTheme: () => ({ colors: {}, preference: "dark", setPreference() {} }),
    },
  );
  const html = renderToStaticMarkup(React.createElement(Appearance));
  assert.match(
    html,
    /aria-checked="true"[^>]*aria-label="Dark appearance"|aria-label="Dark appearance"[^>]*aria-checked="true"/,
  );
  assert.match(
    html,
    /aria-checked="false"[^>]*aria-label="Light appearance"|aria-label="Light appearance"[^>]*aria-checked="false"/,
  );
  const Disclosure = component(
    "src/components/ui/Disclosure.tsx",
    "Disclosure",
    { useTheme: () => ({ colors: {} }) },
  );
  assert.match(
    renderToStaticMarkup(
      React.createElement(Disclosure, { title: "Tools", defaultOpen: true }),
    ),
    /aria-expanded="true"/,
  );
});

test("shared buttons announce busy and disabled states in the real web renderer", () => {
  const Button = component("src/components/ui/Button.tsx", "Button", {
    tokens: { radius: {} },
    styles: {},
    variantStyles: { primary: {} },
    sizeStyles: { md: {} },
    useTheme: () => ({ colors: {} }),
    useReducedMotion: () => true,
    getPressScale: () => 1,
    ActivityIndicator: () => null,
    selectionFeedback: async () => {},
  });
  const html = renderToStaticMarkup(
    React.createElement(Button, { label: "Pay", loading: true }),
  );
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-busy="true"/);
});
