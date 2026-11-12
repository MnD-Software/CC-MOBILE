const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function harness(fixture) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        hidden: false,
        innerHTML: "",
        textContent: "",
        close() {},
        reset() {},
        replaceChildren() {},
        contains() {
          return false;
        },
      });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    fixture,
    URLSearchParams,
    Intl,
    Date,
    setInterval() {},
    setTimeout() {},
    document: {
      getElementById: element,
      querySelector: element,
      querySelectorAll: () => [],
      addEventListener() {},
    },
  });
  for (const path of [
    "backend/app/dashboard/dashboard.js",
    "backend/app/dashboard/workspace.js",
  ])
    vm.runInContext(fs.readFileSync(path, "utf8"), ctx);
  vm.runInContext(
    'session = { customer: { first_name: "<script>alert(1)</script>", role: fixture.role } }; request = async () => fixture;',
    ctx,
  );
  return { ctx, element };
}
function overview(role) {
  return {
    role,
    department: "Kitchen & production",
    generated_at: "2026-11-12T10:00:00Z",
    modules: [
      { id: "overview", label: "Overview" },
      { id: "kitchen", label: "Kitchen & production" },
    ],
    kpis: [
      {
        label: "In the kitchen",
        value: 2,
        hint: "Current workload",
        format: "number",
        change_percent: null,
      },
    ],
    workload: [{ key: "preparing", label: "In the kitchen", count: 2 }],
    sales: null,
    alerts: [],
    activity: [],
  };
}
test("web department overview uses shared metrics, escapes names and omits unauthorized commerce navigation", async () => {
  const { ctx, element } = harness(overview("production"));
  const html = await vm.runInContext("workspaceOverview()", ctx);
  assert.match(html, /In the kitchen/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /data-nav="(?:products|sales|payments|team)"/);
  assert.match(element("nav").innerHTML, /data-nav="kitchen"/);
  await vm.runInContext('show("products")', ctx);
  assert.match(element("notice").textContent, /outside your workspace/);
});
test("web sales graph preserves zero days, ledger values and escaped product names", async () => {
  const fixture = overview("admin");
  fixture.sales = {
    definition: "Verified app ledger only.",
    trend: [
      { date: "2026-11-11", net_minor: 0, orders: 0 },
      { date: "2026-11-12", net_minor: 250000, orders: 1 },
    ],
    top_products: [
      { name: '<img onerror="alert(1)">', quantity: 1, subtotal_minor: 250000 },
    ],
  };
  const { ctx } = harness(fixture);
  const html = await vm.runInContext("workspaceOverview()", ctx);
  assert.match(html, /2026-11-11/);
  assert.match(html, /2,500/);
  assert.match(html, /View daily figures/);
  assert.match(html, /&lt;img onerror=/);
  assert.doesNotMatch(html, /<img onerror=/);
});
