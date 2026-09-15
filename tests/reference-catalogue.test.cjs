require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  referenceCakes,
  referenceCake,
  referenceBackendSlug,
} = require("../src/features/commerce/reference-catalogue.ts");

test("owner supplied display cakes never establish real inventory or purchasability", () => {
  assert.ok(referenceCakes.length > 0);
  for (const cake of referenceCakes) {
    assert.ok(cake.id < 0);
    assert.equal(cake.is_in_stock, false);
    assert.equal(cake.is_purchasable, false);
    assert.equal(cake.review_count, 0);
    assert.equal(referenceCake(cake.slug), cake);
    assert.equal(referenceBackendSlug(cake.id), cake.slug);
  }
  // Never silently substitute a similar live cake or resolve unrelated IDs.
  assert.equal(referenceBackendSlug(123), null);
  assert.equal(referenceCake("chocolate-cake"), undefined);
});
