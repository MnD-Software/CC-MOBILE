const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("membership reverse face cannot show through before the card turns over", () => {
  const source = ts.createSourceFile(
    "MembershipCard.tsx",
    fs.readFileSync("src/features/account/MembershipCard.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const configurations = [];
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === "opacity" &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source) === "turn.interpolate"
    ) {
      const code = ts.transpileModule(
        "globalThis.value = " + node.initializer.arguments[0].getText(source),
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
      ).outputText;
      const context = {};
      vm.runInNewContext(code, context);
      configurations.push(context.value);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(configurations.length, 2);
  function opacity(config, progress) {
    const { inputRange: input, outputRange: output } = config;
    for (let index = 1; index < input.length; index++) {
      if (progress <= input[index])
        return (
          output[index - 1] +
          ((output[index] - output[index - 1]) *
            (progress - input[index - 1])) /
            (input[index] - input[index - 1])
        );
    }
    return output.at(-1);
  }
  const [front, back] = configurations;
  assert.equal(opacity(front, 0), 1);
  assert.equal(opacity(back, 0), 0);
  assert.equal(opacity(front, 1), 0);
  assert.equal(opacity(back, 1), 1);
  for (let step = 0; step <= 1000; step++)
    assert.ok(
      opacity(front, step / 1000) === 0 || opacity(back, step / 1000) === 0,
      "only one face can be visible during the spin",
    );
});
test("membership measures natural content without a growing minimum-height feedback loop", () => {
  const source = ts.createSourceFile(
    "MembershipCard.tsx",
    fs.readFileSync("src/features/account/MembershipCard.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handler;
  const sides = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "measureFace" &&
      node.initializer
    )
      handler = node.initializer;
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "onLayout" &&
      node.initializer?.expression &&
      node.initializer.expression.getText(source).startsWith("measureFace(")
    ) {
      const element = node.parent.parent;
      assert.equal(
        element.tagName.getText(source),
        "View",
        "measure content, not the gradient surface",
      );
      assert.ok(element.getText(source).includes("membership-"));
      assert.ok(!element.getText(source).includes("minHeight"));
      sides.push(node.initializer.expression.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(sides, ["front", "back"]);
  assert.ok(handler);
  for (const side of sides) {
    const pending = [];
    const context = {
      setFaceHeights: (updater) => pending.push(updater),
      Math,
      Number,
    };
    vm.createContext(context);
    const js = ts.transpileModule(
      "const handler = " + handler.getText(source) + ";",
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    vm.runInContext(js + "globalThis.handle=handler;", context);
    const event = { nativeEvent: { layout: { height: 347.2 } } };
    context.handle(side)(event);
    event.nativeEvent = null; // React Native recycles the event after dispatch.
    assert.equal(pending.length, 1);
    const first = pending[0]({ front: 266, back: 266 });
    assert.equal(first[side], 390);
    let current = first;
    for (let change = 0; change < 100; change++) current = pending[0](current);
    assert.equal(
      current,
      first,
      "colour-only renders must not keep increasing height",
    );
    assert.equal(
      pending[0]({ ...first, [side]: 700 })[side],
      390,
      "card can shrink after a narrower layout or larger text is removed",
    );
  }
});
