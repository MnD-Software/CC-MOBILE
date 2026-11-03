const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
require("./register.cjs");
const { previewClub } = require("../src/features/purchase-test/model.ts");

function client(get, preview) {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync("src/features/account/club-api.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    URLSearchParams,
    require(name) {
      if (name === "zod") return require("zod");
      if (name === "@/features/purchase-test/client")
        return {
          purchaseTestOrigin: () =>
            preview ? "http://192.168.0.105:8011" : null,
          purchaseTest: {
            connected: async () => true,
            state: async () => preview,
          },
        };
      if (name === "@/features/purchase-test/model") return { previewClub };
      if (name === "@/api/client")
        return { api: { get }, isApiError: (error) => error.api === true };
      throw new Error(name);
    },
  });
  return exports.clubApi;
}
const entry = {
  id: "entry-1",
  points: 5,
  description: "Confirmed order",
  created_at: "2026-10-08T08:00:00Z",
};

test("transactions use authenticated paginated history when the deployed route exists", async () => {
  let request;
  const api = client(async (path, options) => {
    request = { path, options };
    return { data: [entry], next_cursor: "entry-1" };
  });
  api.overview = () => {
    throw new Error("No fallback required");
  };
  const result = await api.transactions("entry-2");
  assert.equal(request.path, "/v1/club/transactions?limit=20&before=entry-2");
  assert.equal(request.options.auth, true);
  assert.equal(result.data[0].points, 5);
  assert.equal(result.next_cursor, "entry-1");
  assert.equal(result.recent_only, false);
});

test("preview Club and transactions use the same confirmed purchases without live API writes", async () => {
  const state = {
    membership: {
      points: 25,
      purchases: 1,
      tier: "Bronze",
      next_tier: { name: "Silver", purchases_remaining: 1 },
    },
    history: [
      {
        id: "TEST-paid",
        status: "succeeded",
        amount_minor: 10000,
        refunded_minor: 0,
        created_at: "2026-10-24T10:00:00Z",
        items: [{ name: "TEST reward cupcake", test_points: 25, quantity: 1 }],
      },
      {
        id: "TEST-failed",
        status: "failed",
        amount_minor: 10000,
        refunded_minor: 0,
        created_at: "2026-10-24T09:00:00Z",
        items: [],
      },
    ],
  };
  const api = client(() => {
    throw new Error("No production calls allowed");
  }, state);
  const member = await api.overview();
  const ledger = await api.transactions();
  assert.equal(member.points, 25);
  assert.equal(member.purchase_progress.next_tier.purchases_remaining, 1);
  assert.equal(ledger.data.length, 1);
  assert.equal(ledger.data[0].points, 25);
  assert.equal(ledger.data[0].receipt_reference, "TEST-paid");
  assert.equal(ledger.data[0].description, "reward cupcake");
  await assert.rejects(api.redeem(100, "some-request"), /live payments/);
  state.history[0].refunded_minor = 5000;
  state.membership.points = 12;
  const adjusted = await api.transactions();
  assert.equal(adjusted.data[0].points, 12);
  assert.match(adjusted.data[0].description, /adjusted after refund/);
});

test("an older server displays only its genuine recent Club activity", async () => {
  const api = client(async () => {
    throw { api: true, status: 404 };
  });
  let reads = 0;
  api.overview = async () => {
    reads++;
    return { activity: [entry] };
  };
  const result = await api.transactions();
  assert.equal(reads, 1);
  assert.equal(result.data[0], entry);
  assert.equal(result.next_cursor, null);
  assert.equal(result.recent_only, true);
});

test("transactions do not mask auth, server, network or missing-cursor failures", async () => {
  for (const [error, cursor] of [
    [{ api: true, status: 401 }, undefined],
    [{ api: true, status: 500 }, undefined],
    [new Error("Network unavailable"), undefined],
    [{ api: true, status: 404 }, "deleted-cursor"],
  ]) {
    const api = client(async () => {
      throw error;
    });
    api.overview = () => {
      throw new Error("Must not read fallback");
    };
    await assert.rejects(
      api.transactions(cursor),
      (actual) => actual === error,
    );
  }
});
