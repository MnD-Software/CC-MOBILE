require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { appendBagBundle } = require("../src/features/commerce/bag-bundle.ts");
const { lineKey } = require("../src/features/commerce/contracts.ts");
const line = (slug, quantity = 1) => ({
  slug,
  key: lineKey(slug, { size: "1kg", message: "", add_ons: [] }),
  name: slug,
  image: null,
  quantity,
  price: 100,
  selection: { size: "1kg", message: "", add_ons: [] },
});
test("parent cake and accessories add together without mutating the previous bag", () => {
  const old = [line("cake", 2)];
  const result = appendBagBundle(old, [line("cake"), line("candles")]);
  assert.equal(result[0].quantity, 3);
  assert.equal(result[1].slug, "candles");
  assert.equal(old[0].quantity, 2);
});
test("bag limits reject the entire bundle instead of dropping an extra", () => {
  const full = Array.from({ length: 29 }, (_, i) => line("cake-" + i));
  assert.equal(appendBagBundle(full, [line("parent"), line("extra")]), null);
  assert.equal(full.length, 29);
  assert.equal(
    appendBagBundle([line("parent", 20)], [line("parent"), line("extra")]),
    null,
  );
  assert.equal(
    appendBagBundle([], [line("parent"), { ...line("extra"), price: -1 }]),
    null,
  );
});
