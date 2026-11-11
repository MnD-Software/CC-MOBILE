require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { salutation } = require("../src/features/account/salutation.ts");

test("Club salutation follows local morning, afternoon and evening boundaries", () => {
  for (const [hour, expected] of [
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [23, "Good evening"],
  ]) {
    assert.equal(salutation(new Date(2026, 10, 11, hour)), expected);
  }
});
