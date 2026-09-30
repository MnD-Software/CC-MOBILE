const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const commerce = (...parts) =>
  path.join(root, "src", "features", "commerce", ...parts);
const read = (...parts) => fs.readFileSync(commerce(...parts), "utf8");

test("website checkout persists a Cart-Token only for the matching bag fingerprint", () => {
  const sessionPath = commerce("website-checkout-session.ts");
  assert.equal(
    fs.existsSync(sessionPath),
    true,
    "Checkout sessions must live in a dedicated persisted-session boundary.",
  );

  const source = fs.readFileSync(sessionPath, "utf8");
  assert.match(source, /\bcartToken\b/);
  assert.match(source, /\b(?:bagFingerprint|fingerprint)\b/);
  assert.match(source, /(?:getStorageItem|SecureStore\.getItemAsync)\s*\(/);
  assert.match(source, /(?:setStorageItem|SecureStore\.setItemAsync)\s*\(/);
  assert.match(
    source,
    /(?:deleteStorageItem|SecureStore\.deleteItemAsync)\s*\(/,
  );
  assert.match(source, /(?:bagFingerprint|fingerprint)[\s\S]{0,220}(?:!==|!=)/);
  assert.match(
    source,
    /\b(?:clear|invalidate|remove)[A-Za-z]*(?:Session|Cart)\s*\(/,
  );
});

test("website checkout restores a matching cart before replaying add-item requests", () => {
  const source = read("website-checkout.ts");
  assert.match(source, /website-checkout-session/);
  assert.match(
    source,
    /\b(?:load|restore|resume|get)[A-Za-z]*(?:Session|Cart)\s*\(/,
  );
  assert.match(
    source,
    /\b(?:save|persist|store|set)[A-Za-z]*(?:Session|Cart)\s*\(/,
  );
  assert.match(
    source,
    /\b(?:clear|invalidate|remove)[A-Za-z]*(?:Session|Cart)\s*\(/,
  );

  const preparationStart = source.indexOf(
    "export async function prepareWebsiteCheckoutCart",
  );
  const preparationEnd = source.indexOf("\nfunction address", preparationStart);
  assert.ok(
    preparationStart >= 0 && preparationEnd > preparationStart,
    "Checkout preparation must have one explicit replay-safe boundary.",
  );
  const preparation = source.slice(preparationStart, preparationEnd);
  const restore = preparation.search(
    /\b(?:load|restore|resume|get)[A-Za-z]*(?:Session|Cart)\s*\(/,
  );
  const replay = preparation.indexOf("createWebsiteCart(lines)");
  assert.ok(
    replay >= 0,
    "The secure-cart builder should still add a new bag once.",
  );
  assert.ok(
    restore >= 0 && restore < replay,
    "A matching persisted Cart-Token must be considered before add-item replay.",
  );
  assert.match(source, /cartToken\s*=\s*result\.cartToken/);
});

test("checkout treats secure cart construction as a mutation, not a refetchable query", () => {
  const source = read("CheckoutScreen.tsx");
  assert.match(source, /\buseMutation\b/);
  assert.match(source, /\bmutationFn\b/);
  assert.match(source, /\bprepareWebsiteCheckoutCart\b/);
  assert.match(source, /autoPreparedFingerprint\.current\s*===\s*fingerprint/);
  assert.match(source, /cartMutation\.mutate\(\)/);
  assert.doesNotMatch(
    source,
    /useQuery\s*\(\s*\{[\s\S]*?queryFn\s*:[\s\S]*?(?:prepareWebsiteCheckoutCart|createWebsiteCart)/,
  );
});

test("private checkout recovery and tracked order keys are scoped to a signed-in account", () => {
  const session = read("website-checkout-session.ts");
  const checkout = read("CheckoutScreen.tsx");
  const history = read("website-order-history.ts");

  assert.match(session, /websiteCheckoutOwnerScope/);
  assert.match(session, /ownerScope: ownerScopeSchema/);
  assert.match(session, /if \(!ownerScope\) return null/);
  assert.match(session, /guest checkout remains possible/i);
  assert.match(checkout, /websiteCheckoutOwnerScope\(customer\?\.id\)/);
  assert.match(
    checkout,
    /loadWebsitePaymentAttempt\(fingerprint, ownerScope\)/,
  );
  assert.match(
    checkout,
    /saveWebsiteOrder\(order, details\.email, ownerScope\)/,
  );
  assert.match(history, /website-order-history\.v2/);
  assert.match(history, /if \(!ownerScope\) return \[\]/);
});
