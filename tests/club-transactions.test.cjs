const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

function client(get) {
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
