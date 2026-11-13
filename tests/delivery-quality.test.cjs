require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  deliveryQualityNotes,
} = require("../src/features/logistics/delivery-feedback.ts");
test("delivery quality never implies missing customer feedback is good", () => {
  assert.deepEqual(deliveryQualityNotes(null), [
    { label: "Awaiting customer feedback", tone: "neutral" },
  ]);
  const report = {
    rating: 3,
    timing: "late",
    condition: "damaged",
    comment: "",
  };
  assert.deepEqual(
    deliveryQualityNotes(report).map((n) => n.tone),
    ["warning", "issue"],
  );
  assert.deepEqual(
    deliveryQualityNotes({
      ...report,
      timing: "on_time",
      condition: "good",
    }).map((n) => n.tone),
    ["good", "good"],
  );
  assert.equal(
    deliveryQualityNotes({ ...report, timing: "not_sure" })[0].tone,
    "neutral",
  );
});
