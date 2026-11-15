const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function render(variants, selected = variants[0]) {
  const jsx = (type, props) => ({ type, props });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Pressable: "Radio", ScrollView: "Scroll", View: "View" },
    "@/components/ui/Typography": { Text: "Text" },
    "@/theme/ThemeProvider": { useTheme: () => ({ colors: {} }) },
  };
  const context = {
    exports: {},
    require: (id) => {
      assert.ok(modules[id], id);
      return modules[id];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/studio/SizeFinishPicker.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    context,
  );
  const selections = [];
  const tree = context.exports.SizeFinishPicker({
    variants,
    selected,
    onSelect: (v) => selections.push(v),
  });
  const radios = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Radio") radios.push(node);
    for (const child of [node.props?.children].flat(2)) visit(child);
  }
  visit(tree);
  return { radios, selections, tree };
}

test("DIY size and finish selection ignores null catalogue attributes without changing the selected SKU", () => {
  const variants = [2, 3].map((kg) => ({
    id: kg,
    price_minor: kg * 100000,
    attributes: [
      { name: "pa_cake-size", value: `${kg}kg` },
      { name: "Type of Cake", value: null },
      { attribute: "pa_cream", value: "with-cream" },
      null,
      { name: "Invalid", value: {} },
      { name: "Blank", value: " " },
    ],
  }));
  const result = render(variants);
  assert.equal(result.radios.length, 3);
  assert.ok(
    result.radios.every(
      (r) =>
        !/null|undefined|object|Type of Cake/.test(r.props.accessibilityLabel),
    ),
  );
  assert.equal(result.radios[0].props.accessibilityState.checked, true);
  result.radios[1].props.onPress();
  assert.equal(result.selections[0], variants[1]);
  assert.match(
    result.radios[2].props.accessibilityLabel,
    /Soft icing.*with cream/,
  );
});

test("DIY variants with missing or invalid attribute collections render the original finish", () => {
  for (const attributes of [undefined, null, {}, [null, { name: "Size" }]]) {
    const result = render([{ id: 1, price_minor: 350000, attributes }]);
    assert.equal(result.radios.length, 0);
    assert.match(JSON.stringify(result.tree), /Original recipe and finish/);
  }
});
