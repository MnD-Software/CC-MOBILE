require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  clubWelcomeCopy,
} = require("../src/features/account/club-welcome-copy.ts");
test("Club messages follow Kenya dayparts and weekday rollover", () => {
  const morning = clubWelcomeCopy(new Date("2026-11-14T05:00:00Z"));
  const afternoon = clubWelcomeCopy(new Date("2026-11-14T10:00:00Z"));
  const evening = clubWelcomeCopy(new Date("2026-11-14T17:00:00Z"));
  const sunday = clubWelcomeCopy(new Date("2026-11-14T21:30:00Z"));
  assert.equal(morning.label, "Saturday morning");
  assert.equal(afternoon.label, "Saturday afternoon");
  assert.equal(evening.label, "Saturday evening");
  assert.equal(sunday.label, "Sunday morning");
  assert.equal(
    new Set([morning.title, afternoon.title, evening.title, sunday.title]).size,
    4,
  );
  assert.equal(
    clubWelcomeCopy(new Date("2026-11-14T05:55:00Z")).title,
    morning.title,
  );
});
