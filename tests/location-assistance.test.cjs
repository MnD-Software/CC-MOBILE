require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  locationAddressSuggestion,
} = require("../src/features/commerce/location-assistance.ts");

test("foreground location suggestions retain only editable address text", () => {
  assert.deepEqual(
    locationAddressSuggestion({
      formattedAddress: "  12  Riverside Drive, Westlands ",
      district: "Westlands",
      city: "Nairobi",
    }),
    {
      address: "12 Riverside Drive, Westlands",
      area: "Westlands",
      city: "Nairobi",
    },
  );
});

test("location suggestions use address parts when Android has no formatted address", () => {
  assert.deepEqual(
    locationAddressSuggestion({
      name: "Cake City",
      streetNumber: "7",
      street: "Kimathi Street",
      subregion: "Nairobi County",
      region: "Nairobi",
    }),
    {
      address: "Cake City, 7 Kimathi Street",
      area: "Nairobi County",
      city: "Nairobi",
    },
  );
  assert.equal(locationAddressSuggestion({}), null);
});
