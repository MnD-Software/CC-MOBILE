require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  celebrationReminderDate,
} = require("../src/features/account/reminder-date.ts");

test("celebration reminders handle next year, leap birthdays and close dates", () => {
  const reminder = celebrationReminderDate(1, 3, new Date(2026, 11, 1));
  assert.equal(reminder.getFullYear(), 2026);
  assert.equal(reminder.getMonth(), 11);
  assert.equal(reminder.getDate(), 27);
  assert.equal(
    celebrationReminderDate(2, 29, new Date(2027, 0, 1)).getDate(),
    21,
  );
  const now = new Date(2026, 9, 7, 12);
  assert.equal(
    celebrationReminderDate(10, 10, now).getTime(),
    now.getTime() + 60000,
  );
  assert.throws(() => celebrationReminderDate(2, 30, now));
});
