require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { tokens } = require("../src/theme/tokens.ts");
const { darkColors } = require("../src/theme/appearance.ts");
const {
  memberBarcode,
  barcodeModules,
  membershipPalette,
} = require("../src/features/account/member-card.ts");
function luminance(hex) {
  const c = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test("small text and feedback remain readable on light and dark surfaces", () => {
  for (const colors of [tokens.color, darkColors])
    for (const fg of [
      "ink",
      "cocoa",
      "muted",
      "mutedSoft",
      "brandStrong",
      "success",
      "warning",
      "error",
    ])
      for (const bg of ["background", "surface", "surfaceRaised"])
        assert.ok(
          contrast(colors[fg], colors[bg]) >= 4.5,
          `${fg}/${bg}: ${contrast(colors[fg], colors[bg])}`,
        );
  assert.ok(contrast("#FFFFFF", tokens.color.brandStrong) >= 4.5);
});
test("branch barcode preserves exact UUID identity and includes quiet zones", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const code = memberBarcode(id);
  assert.equal(
    code,
    "CC1:" + Buffer.from(id.replaceAll("-", ""), "hex").toString("base64url"),
  );
  assert.equal(code.length, 26);
  const modules = barcodeModules(code);
  assert.match(modules, /^0{10}1[01]+10{10}$/);
  assert.throws(() => memberBarcode("not-a-member"));
  assert.notDeepEqual(membershipPalette("Silver"), membershipPalette("Gold"));
});
