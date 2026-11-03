require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  milestoneProgress,
  MilestoneTracker,
} = require("../src/features/account/milestones.ts");
const milestones = [
  { purchases: 0, name: "Bronze" },
  { purchases: 2, name: "Silver" },
  { purchases: 4, name: "Gold" },
  { purchases: 5, name: "Diamond" },
  { purchases: 6, name: "Platinum" },
];

test("overall progress continues through Gold and Diamond until the final milestone", () => {
  const gold = milestoneProgress({
    purchases: 4,
    milestones,
    next_tier: { name: "Diamond", purchases_remaining: 1 },
  });
  assert.equal(gold.current, 4);
  assert.equal(gold.total, 6);
  assert.equal(gold.target, "Platinum");
  assert.equal(gold.next, "1 more purchase to Diamond");
  const platinum = milestoneProgress({
    purchases: 9,
    milestones,
    next_tier: null,
  });
  assert.equal(platinum.current, 6);
  assert.match(platinum.next, /Platinum unlocked/);
  assert.equal(milestoneProgress(), undefined);
  assert.equal(
    milestoneProgress({ purchases: 1, milestones: [], next_tier: null }),
    undefined,
  );
});

test("milestone celebrations fire once per confirmed upgrade without replaying on a refund or refresh", () => {
  const tracker = new MilestoneTracker();
  const update = (tier) => tracker.update({ owner: "member-a", tier });
  assert.equal(update("Bronze"), null);
  for (const tier of ["Silver", "Gold", "Diamond", "Platinum"]) {
    assert.equal(update(tier), tier);
    assert.equal(update(tier), null);
  }
  assert.equal(update("Diamond"), null);
  assert.equal(update("Platinum"), null);
});

test("sign-in, member switches and reconnection establish a baseline without showing another member's milestone", () => {
  const tracker = new MilestoneTracker();
  assert.equal(tracker.update({ owner: "member-a", tier: "Gold" }), null);
  assert.equal(tracker.update({ owner: "member-b", tier: "Platinum" }), null);
  assert.equal(tracker.update(null), null);
  assert.equal(tracker.update({ owner: "member-a", tier: "Diamond" }), null);
  assert.equal(
    tracker.update({ owner: "member-a", tier: "Platinum" }),
    "Platinum",
  );
  assert.equal(tracker.update({ owner: "member-a", tier: "not-a-tier" }), null);
});
