require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  activeCampaigns,
  campaignRemaining,
  campaignSchema,
  contentApi,
} = require("../src/features/editorial/content.ts");
const { ApiError } = require("../src/api/client.ts");

const now = Date.parse("2026-10-10T09:00:00+03:00");
const campaign = (overrides = {}) => ({
  id: "offer-1",
  revision: 1,
  title: "Real offer",
  description: "Published Cake City artwork",
  image_url: "https://cakecity.co.ke/cake.jpg",
  video_url: "",
  starts_at: "2026-10-10T08:00:00+03:00",
  ends_at: "2026-10-10T10:00:00+03:00",
  product_slugs: ["real-cake"],
  category_id: null,
  branch_names: [],
  member_only: false,
  published: true,
  template: "offer",
  ...overrides,
});
test("cached stories expire at the exact boundary and drafts never appear", () => {
  const row = campaign();
  assert.equal(activeCampaigns([row], now).length, 1);
  assert.equal(activeCampaigns([row], Date.parse(row.ends_at)).length, 0);
  assert.equal(
    activeCampaigns([campaign({ published: false })], now).length,
    0,
  );
  assert.equal(
    activeCampaigns([campaign({ starts_at: "2026-10-10T11:00:00+03:00" })], now)
      .length,
    0,
  );
});
test("story countdown uses only the scheduled end and invalid times are not persuasive", () => {
  assert.equal(
    campaignRemaining("2026-10-10T09:15:00+03:00", now),
    "15 min left",
  );
  assert.equal(campaignRemaining("2026-10-10T09:00:00+03:00", now), "Ended");
  assert.equal(campaignRemaining("bad date", now), "Ended");
});
test("editorial content rejects executable media sources", () => {
  assert.equal(
    campaignSchema.safeParse(campaign({ image_url: "javascript:alert(1)" }))
      .success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse(
      campaign({ image_url: "/v1/content/assets/" + "a".repeat(64) }),
    ).success,
    true,
  );
  assert.equal(
    campaignSchema.safeParse(
      campaign({ image_url: "http://insecure.example/cake.jpg" }),
    ).success,
    false,
  );
});
test("older backend fallback does not hide server or authorization failures", async () => {
  const { api } = require("../src/api/client.ts");
  const get = api.get;
  try {
    api.get = async () => {
      throw new ApiError("missing", { code: "HTTP_404", status: 404 });
    };
    assert.deepEqual(await contentApi.campaigns(), []);
    assert.equal(await contentApi.product(10), null);
    for (const status of [401, 403, 500]) {
      api.get = async () => {
        throw new ApiError("failed", { code: "HTTP_" + status, status });
      };
      await assert.rejects(
        contentApi.campaigns(),
        (error) => error.status === status,
      );
    }
  } finally {
    api.get = get;
  }
});
