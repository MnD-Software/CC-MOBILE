require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseAppearance,
  resolveAppearance,
  themeColor,
  themedStyleMap,
  darkColors,
} = require("../src/theme/appearance.ts");

test("appearance preference safely restores and follows system only when selected", () => {
  assert.equal(parseAppearance("dark"), "dark");
  assert.equal(parseAppearance("light"), "light");
  assert.equal(parseAppearance("system"), "system");
  for (const value of [null, "invalid", {}])
    assert.equal(parseAppearance(value), "light");
  assert.equal(resolveAppearance("system", "dark"), "dark");
  assert.equal(resolveAppearance("system", null), "light");
  assert.equal(resolveAppearance("light", "dark"), "light");
  assert.equal(resolveAppearance("dark", "light"), "dark");
});

test("dark style mapping changes neutral paint without inverting brand buttons or white labels", () => {
  assert.equal(themeColor("color", "#251914", true), darkColors.ink);
  assert.equal(themeColor("color", "#51382D", true), darkColors.cocoa);
  assert.equal(themeColor("color", "#FFFFFF", true), "#FFFFFF");
  assert.equal(themeColor("backgroundColor", "#B80068", true), "#B80068");
  assert.equal(themeColor("backgroundColor", "#51382D", true), "#51382D");
  assert.equal(
    themeColor("backgroundColor", "#FFFFFF", true),
    darkColors.surface,
  );
  assert.equal(themeColor("borderColor", "#EEE6E4", true), darkColors.border);
  assert.equal(
    themeColor("backgroundColor", "rgba(255,255,255,0.82)", true),
    "rgba(33,27,36,0.82)",
  );
  const original = {
    card: { backgroundColor: "#FFFFFF", opacity: 0.8, borderRadius: 30 },
    title: { color: "#251914" },
  };
  assert.equal(themedStyleMap(original, false), original);
  const themed = themedStyleMap(original, true);
  assert.equal(themed.card.backgroundColor, darkColors.surface);
  assert.equal(themed.card.opacity, 0.8);
  assert.equal(original.card.backgroundColor, "#FFFFFF");
});
