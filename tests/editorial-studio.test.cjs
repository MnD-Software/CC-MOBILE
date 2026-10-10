require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  campaignExpiry,
  newCampaign,
  storyStatus,
  storyProblem,
} = require("../src/features/editorial/studio.ts");

test("quick expiry uses Nairobi midnight even when the UTC date differs", () => {
  const now = Date.parse("2026-10-10T22:00:00Z");
  const start = new Date(now).toISOString();
  assert.equal(campaignExpiry("today", start, now), "2026-10-11T20:59:59.999Z");
  assert.equal(
    campaignExpiry("tomorrow", start, now),
    "2026-10-12T20:59:59.999Z",
  );
  assert.equal(campaignExpiry("week", start, now), "2026-10-18T20:59:59.999Z");
});
test("scheduled story expiry follows its future start rather than today's date", () => {
  const now = Date.parse("2026-10-10T09:00:00+03:00");
  assert.equal(
    campaignExpiry("today", "2026-11-01T12:00:00+03:00", now),
    "2026-11-01T20:59:59.999Z",
  );
});
test("stories distinguish drafts, scheduled, live and expired at exact boundaries", () => {
  const now = Date.parse("2026-10-10T09:00:00+03:00");
  const story = { ...newCampaign(now), published: true };
  assert.equal(storyStatus(story, now), "Live");
  assert.equal(
    storyStatus({ ...story, starts_at: new Date(now + 1).toISOString() }, now),
    "Scheduled",
  );
  assert.equal(storyStatus(story, Date.parse(story.ends_at)), "Ended");
  assert.equal(
    storyStatus({ ...story, published: false }, Date.parse(story.ends_at)),
    "Draft",
  );
});
test("expired drafts can be saved but cannot accidentally be published", () => {
  const now = Date.parse("2026-10-10T09:00:00+03:00");
  const story = {
    ...newCampaign(now - 86400000 * 3),
    title: "Weekend cakes",
    image_url: "https://cakecity.co.ke/cake.jpg",
    product_slugs: ["real-cake"],
  };
  assert.equal(storyProblem(story, false, now), null);
  assert.match(storyProblem(story, true, now), /future end time/);
});
test("publishing requires a photo, a readable name, real selection and valid schedule", () => {
  const now = Date.now();
  const story = {
    ...newCampaign(now),
    title: "Weekend cakes",
    image_url: "https://cakecity.co.ke/cake.jpg",
    product_slugs: ["real-cake"],
  };
  assert.equal(storyProblem(story, true, now), null);
  assert.match(
    storyProblem({ ...story, product_slugs: [] }),
    /Choose the cakes/,
  );
  assert.match(storyProblem({ ...story, image_url: "" }), /photo/);
  assert.match(storyProblem({ ...story, ends_at: story.starts_at }), /after/);
});
