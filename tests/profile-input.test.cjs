require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { profileInputSchema } = require("../src/auth/profile.ts");

test("profile input preserves real names and normalizes editable contact fields", () => {
  assert.deepEqual(
    profileInputSchema.parse({
      first_name: " Amina ",
      last_name: " O’Neil ",
      phone: "+254 712 345 678",
    }),
    { first_name: "Amina", last_name: "O’Neil", phone: "+254712345678" },
  );
  for (const phone of ["", " ", null])
    assert.equal(
      profileInputSchema.parse({ first_name: "李", last_name: "Owner", phone })
        .phone,
      null,
    );
});

test("profile input rejects invalid contacts, invisible names and identity mutation fields", () => {
  const input = { first_name: "Amina", last_name: "Owner", phone: null };
  for (const change of [
    { first_name: "  " },
    { last_name: "x".repeat(81) },
    { first_name: "Hidden\u202ename" },
    { phone: "invalid" },
    { phone: "07123456789" },
    { role: "admin" },
    { email: "other@example.com" },
  ])
    assert.throws(() => profileInputSchema.parse({ ...input, ...change }));
});
