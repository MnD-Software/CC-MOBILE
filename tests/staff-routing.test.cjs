require("./register.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  isStaffRole,
  staffRoles,
  staffRouteAllowed,
  staffGreeting,
} = require("../src/auth/staff-routing.ts");

test("all staff roles land in an operational workspace and cannot open the customer catalogue", () => {
  assert.equal(isStaffRole("customer"), false);
  assert.equal(isStaffRole(undefined), false);
  for (const role of staffRoles) {
    assert.equal(isStaffRole(role), true);
    assert.equal(staffRouteAllowed(role, "/workspace"), true);
    for (const path of [
      "/",
      "/home",
      "/shop",
      "/loyalty",
      "/cart",
      "/product/cake",
    ])
      assert.equal(staffRouteAllowed(role, path), false);
  }
});
test("department routes restrict kitchen, dispatch, riders and reporting separately", () => {
  assert.equal(staffRouteAllowed("head_chef", "/kitchen"), true);
  assert.equal(staffRouteAllowed("branch_dispatch", "/dispatch"), true);
  assert.equal(staffRouteAllowed("rider", "/rider"), true);
  assert.equal(staffRouteAllowed("rider", "/kitchen"), false);
  assert.equal(staffRouteAllowed("production", "/commerce-operations"), false);
  assert.equal(staffRouteAllowed("finance", "/commerce-operations"), true);
  assert.equal(staffRouteAllowed("finance", "/dispatch"), false);
  assert.equal(
    staffRouteAllowed("customer_service", "/campaign-studio"),
    false,
  );
});
test("workspace salutation follows morning, afternoon and evening boundaries", () => {
  assert.equal(staffGreeting(11), "Good morning");
  assert.equal(staffGreeting(12), "Good afternoon");
  assert.equal(staffGreeting(17), "Good evening");
});
