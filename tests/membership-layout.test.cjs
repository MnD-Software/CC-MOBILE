const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("both membership faces snapshot native layout before deferred state updates", () => {
  const source = ts.createSourceFile(
    "MembershipCard.tsx",
    fs.readFileSync("src/features/account/MembershipCard.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map();
  const handlers = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      declarations.set(node.name.text, node.initializer);
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "onLayout" &&
      node.initializer?.expression
    )
      handlers.push(node.initializer.expression);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let faces = 0;
  for (const expression of handlers) {
    const handler = ts.isIdentifier(expression)
      ? declarations.get(expression.text)
      : expression;
    if (!handler || !handler.getText(source).includes("setFaceHeight"))
      continue;
    faces++;
    const pending = [];
    const context = { setFaceHeight: (updater) => pending.push(updater), Math };
    vm.createContext(context);
    const js = ts.transpileModule(
      "const handler = " + handler.getText(source) + ";",
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    vm.runInContext(js + "globalThis.handle=handler;", context);
    const event = { nativeEvent: { layout: { height: 347.2 } } };
    context.handle(event);
    event.nativeEvent = null; // React Native recycles the event after dispatch.
    assert.equal(pending.length, 1);
    assert.equal(pending[0](300), 348);
    assert.equal(pending[0](380), 380);
  }
  assert.equal(
    faces,
    2,
    "both front and barcode face must use the safe handler",
  );
});
