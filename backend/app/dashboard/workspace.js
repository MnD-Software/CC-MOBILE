"use strict";
// Same authenticated API and metric definitions as the native staff workspace.
let workspaceFrom = "",
  workspaceTo = "",
  workspaceMode = "live";
let enquiries = [];
Object.assign(sections, {
  reviews: [
    "S",
    "Customer satisfaction",
    "Receipt confirmed. Every rating heard.",
  ],
  riders: [
    "R",
    "Rider accounts",
    "Create rider logins and connect your delivery team.",
  ],
  overview: [
    "01",
    "Command centre",
    "The right information for your next decision.",
  ],
  rider: [
    "R",
    "My deliveries",
    "Your assigned collections, routes and delivery outcomes.",
  ],
  team: [
    "T",
    "Team directory",
    "Authorized staff and their operational locations.",
  ],
  audit: [
    "A",
    "Audit trail",
    "Recorded administrative actions and accountability.",
  ],
  enquiries: [
    "E",
    "Customer enquiries",
    "Support, celebration requests and corporate conversations.",
  ],
});

function workspaceRange(days = 7) {
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - days + 1);
  return { from: first.toISOString().slice(0, 10), to: today };
}
function salesChart(sales) {
  const points = sales.trend;
  const max = Math.max(1, ...points.map((p) => Math.abs(p.net_minor)));
  const step = 640 / Math.max(1, points.length);
  const bars = points
    .map((point, i) => {
      const height = (Math.abs(point.net_minor) / max) * 150;
      return `<rect class="${point.net_minor < 0 ? "chart-negative" : "chart-positive"}" x="${20 + i * step}" y="${170 - height}" width="${Math.max(1, step - 4)}" height="${height}" rx="3"><title>${esc(point.date)} / ${esc(money(point.net_minor))} / ${point.orders} paid orders</title></rect>`;
    })
    .join("");
  return `<section class="panel sales-rhythm"><div class="panel-heading"><div><span class="eyebrow">VERIFIED LIVE PAYMENTS</span><h2>Sales rhythm</h2></div><span class="pill good">App channel</span></div><p>Daily net sales in KES. ${esc(points[0]?.date)} to ${esc(points.at(-1)?.date)}.</p><svg class="sales-chart" role="img" aria-label="Daily net sales. Exact values are available in the daily figures below." viewBox="0 0 680 195"><path d="M20 20H660M20 95H660M20 170H660" class="chart-grid"/>${bars}<text x="20" y="191">${esc(points[0]?.date)}</text><text x="660" y="191" text-anchor="end">${esc(points.at(-1)?.date)}</text></svg><details><summary>View daily figures</summary>${table(
    ["Kenyan date", "Paid orders", "Net sales"],
    points.map(
      (p) =>
        `<tr><td>${esc(p.date)}</td><td>${p.orders}</td><td>${money(p.net_minor)}</td></tr>`,
    ),
  )}</details></section>`;
}
async function workspaceOverview() {
  const initial = workspaceRange();
  workspaceFrom ||= initial.from;
  workspaceTo ||= initial.to;
  const owner = session?.customer.id;
  const expectedGeneration = generation;
  const nextOverview = await request(
    `/v1/staff/overview?${new URLSearchParams({ from_date: workspaceFrom, to_date: workspaceTo, mode: workspaceMode })}`,
  );
  if (session?.customer.id !== owner || generation !== expectedGeneration)
    throw Error("The signed-in account changed. Open your workspace again.");
  staffOverview = nextOverview;
  const data = staffOverview;
  navigation();
  $("workspace-department").textContent = data.department;
  const hour = (new Date().getUTCHours() + 3) % 24;
  const salutation =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const tools = data.modules.filter((module) => module.id !== "overview");
  const hero = `<section class="workspace-hero"><div><span class="eyebrow">${esc(data.department.toUpperCase())}</span><h2>${salutation}, ${esc(session.customer.first_name || "team")}.</h2><p>One connected team. Every celebration, accounted for.</p><span class="freshness"><i></i> Updated ${esc(new Date(data.generated_at).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" }))} EAT / refreshes while visible</span></div><div class="hero-seal" aria-hidden="true">CC<span>OPERATIONS</span></div></section>`;
  const filters = `<form id="workspace-period" class="period-toolbar"><div class="date-fields">${input("from", "From (Kenyan date)", workspaceFrom, "date", "required")}${input("to", "To (Kenyan date)", workspaceTo, "date", "required")}<button class="primary">Apply period</button></div><div class="period-actions"><button type="button" data-period="7">7 days</button><button type="button" data-period="30">30 days</button><button type="button" data-period="90">90 days</button><div class="view-switch" role="group" aria-label="Data view"><button type="button" data-workspace-mode="live" aria-pressed="${workspaceMode === "live"}">Live operations</button><button type="button" data-workspace-mode="simulation" aria-pressed="${workspaceMode === "simulation"}">Review orders</button></div>${data.sales ? '<button type="button" data-export-overview="true">Export figures</button>' : ""}</div></form>`;
  const cards = `<div class="stats ecosystem-stats">${data.kpis.map((kpi) => `<div class="stat"><small>${esc(kpi.label)}</small><strong>${esc(kpi.format === "money" ? money(kpi.value) : kpi.value.toLocaleString("en-KE"))}</strong>${kpi.change_percent !== null ? `<b class="${kpi.change_percent >= 0 ? "positive-change" : "negative-change"}">${kpi.change_percent > 0 ? "+" : ""}${kpi.change_percent}% vs previous period</b>` : ""}<span>${esc(kpi.hint)}</span></div>`).join("")}</div>`;
  const workload = `<section class="panel"><span class="eyebrow">RIGHT NOW</span><h2>Work in motion</h2>${data.workload.length ? data.workload.map((row) => `<div class="workload-row"><div><b>${esc(row.label)}</b><span>${row.count} ${row.count === 1 ? "order or task" : "orders or tasks"}</span></div><meter min="0" max="${Math.max(1, ...data.workload.map((r) => r.count))}" value="${row.count}" aria-label="${esc(row.label)}: ${row.count}">${row.count}</meter></div>`).join("") : "<p>Your authorized modules and insights are ready below.</p>"}<small>Current backlog, independent of the selected sales period. Location and rider scopes apply.</small></section>`;
  const popular = data.sales
    ? `<section class="panel"><span class="eyebrow">CUSTOMER FAVOURITES</span><h2>Most celebrated cakes</h2>${data.sales.top_products.length ? data.sales.top_products.map((p, i) => `<div class="popular-row"><span class="rank">${String(i + 1).padStart(2, "0")}</span><div><b>${esc(p.name)}</b><small>${esc(p.quantity)} items / before discounts & reversals</small></div><strong>${money(p.subtotal_minor)}</strong></div>`).join("") : "<p>No item-linked live sales in this period yet.</p>"}</section>`
    : workload;
  const alerts = `<section class="panel"><span class="eyebrow">NEXT BEST ACTION</span><h2>Attention desk</h2>${data.alerts.length ? data.alerts.map((alert) => `<button class="attention-row" data-nav="${esc(alert.tab)}"><strong>${alert.count}</strong><span>${esc(alert.label)}</span><b aria-hidden="true">&rarr;</b></button>`).join("") : '<p class="calm-state">No overview alerts in your department.</p>'}</section>`;
  const shortcuts = `<section class="tool-grid" aria-label="Your department tools">${tools.map((module, i) => `<button data-nav="${esc(module.id)}"><span class="tool-number">${String(i + 1).padStart(2, "0")}</span><b>${esc(module.label)}</b><span aria-hidden="true">&rarr;</span></button>`).join("")}</section>`;
  const activity = data.activity.length
    ? `<section class="panel"><div class="panel-heading"><h2>Recent activity</h2><button data-nav="audit">Open audit trail</button></div>${data.activity.map((event) => `<div class="activity-row"><span class="activity-mark" aria-hidden="true"></span><div><strong>${esc(event.action.replaceAll("_", " ").replaceAll(".", " / "))}</strong><small>${esc(event.reference)}</small></div><time>${esc(date(event.at))}</time></div>`).join("")}</section>`
    : "";
  return (
    hero +
    filters +
    (workspaceMode === "simulation"
      ? '<div class="simulation-notice">Review orders / no real payment or live sales included.</div>'
      : "") +
    cards +
    `<div class="insight-grid">${data.sales ? salesChart(data.sales) : workload}${popular}</div><div class="insight-grid">${alerts}${data.sales && data.workload.length ? workload : '<section class="panel"><span class="eyebrow">YOUR ACCESS</span><h2>Purpose-built for your role.</h2><p>The tools below open your authorized department work. Payment verification, preparation, dispatch and rider actions keep their existing audit and validation rules.</p></section>'}</div><h2 class="section-title">Your workspace</h2>` +
    shortcuts +
    activity +
    (data.sales
      ? `<p class="metric-definition">${esc(data.sales.definition)}</p>`
      : "")
  );
}
views.reviews = async () => {
  const rows = await request("/v1/admin/order-reviews?limit=100");
  const average = rows.length
    ? (rows.reduce((sum, r) => sum + r.rating, 0) / rows.length).toFixed(1)
    : "?";
  return (
    `<section class="queue-heading"><div><span class="eyebrow">AFTER THE CELEBRATION</span><h2>Every slice. Every experience.</h2><p>Showing ${rows.length} order reviews / average shown ${average} out of 5. Feedback is private to the customer team.</p></div></section>` +
    (rows.length
      ? `<div class="cards">${rows.map((r) => `<section class="panel workflow-card"><span class="pill ${r.rating >= 4 ? "good" : ""}">${r.rating} / 5 stars</span><h2>${esc(r.reference)}</h2><p>${esc(r.comment || "The customer left a rating.")}</p><small>${esc(date(r.created_at))}</small></section>`).join("")}</div>`
      : empty(
          "The next celebration has a story",
          "Ratings appear after the customer confirms receiving their cake and shares their experience.",
        ))
  );
};
views.riders = async () => {
  const rows = await request("/v1/logistics/riders");
  return (
    `<section class="panel"><span class="eyebrow">YOUR DELIVERY TEAM</span><h2>Give every delivery a clear owner.</h2><p>Create a rider account, then assign an order from Dispatch. Riders sign in on mobile to accept work, see cake and recipient details, and complete their deliveries.</p><button class="primary" data-create-rider="true">Create rider account</button></section>` +
    table(
      ["Rider", "Role"],
      rows.map(
        (r) => `<tr><td>${esc(r.name)}</td><td>${pill(r.role)}</td></tr>`,
      ),
    )
  );
};
views.team = async () => {
  const rows = await request("/v1/staff/team");
  return (
    `<section class="panel"><h2>A connected team, with clear access.</h2><p>Roles and location scopes are managed privately by an administrator. This directory never contains passwords, API keys or session tokens.</p></section>` +
    table(
      ["Team member", "Account", "Department role", "Assigned locations"],
      rows.map(
        (row) =>
          `<tr><td><strong>${esc(row.name)}</strong></td><td>${esc(row.email)}</td><td>${pill(row.role.replaceAll("_", " "))}</td><td>${esc(row.plants.join(" / ") || "Role defaults apply")}</td></tr>`,
      ),
    )
  );
};
views.audit = async () => {
  const rows = await request("/v1/admin/audit");
  return table(
    ["When", "Action", "Resource"],
    rows.map(
      (row) =>
        `<tr><td>${esc(date(row.created_at))}</td><td>${esc(row.action.replaceAll("_", " "))}</td><td>${esc(row.resource_id)}</td></tr>`,
    ),
  );
};
views.enquiries = async () => {
  enquiries = await request("/v1/admin/enquiries");
  return enquiries.length
    ? `<div class="cards">${enquiries.map((row) => `<section class="panel">${pill(row.status, ["resolved", "accepted"].includes(row.status))}<h2>${esc(row.subject)}</h2><p>${esc(row.details)}</p><small>${esc(date(row.created_at))}</small>${row.staff_response ? `<p><strong>Latest response:</strong> ${esc(row.staff_response)}</p>` : ""}${!["accepted", "resolved", "declined"].includes(row.status) ? `<button data-enquiry="${esc(row.id)}">Reply or prepare a quote</button>` : ""}</section>`).join("")}</div>`
    : empty("All caught up", "New customer enquiries appear here.");
};
views.rider = async () => {
  const trips = await request("/v1/rider/tasks");
  const next = {
    assigned: ["accepted", "Accept assignment"],
    rescheduled: ["accepted", "Accept new schedule"],
    accepted: ["collected", "Confirm collection"],
    collected: ["in_transit", "Start delivery"],
    in_transit: ["delivered", "Confirm delivered"],
  };
  return `<p>Only your assigned tasks appear here. Use the mobile Rider workspace for controlled GPS sharing while on a delivery.</p><div class="cards">${trips.map((trip) => `<section class="panel">${pill(trip.status, trip.status === "delivered")}<h2>${esc(trip.reference)}</h2><p>${esc(trip.destination)}</p><p>${esc(trip.recipient)} / ${esc(trip.phone)}</p><div class="workflow-actions">${next[trip.status] ? `<button data-rider-trip="${esc(trip.id)}" data-revision="${trip.revision}" data-status="${next[trip.status][0]}">${next[trip.status][1]}</button>` : ""}${!["delivered", "cancelled", "failed"].includes(trip.status) ? `<button data-rider-trip="${esc(trip.id)}" data-revision="${trip.revision}" data-status="failed">Report delivery issue</button>` : ""}</div></section>`).join("") || empty("No assignments yet", "Dispatch will send your deliveries here.")}</div>`;
};

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "workspace-period") return;
  event.preventDefault();
  const form = new FormData(event.target);
  workspaceFrom = form.get("from");
  workspaceTo = form.get("to");
  await show("overview");
});
document.addEventListener("change", async (event) => {
  if (event.target.id !== "workspace-mode") return;
  workspaceMode = event.target.value;
  await show("overview");
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.createRider) {
    openEditor(
      "Create rider account",
      `<div class="form-grid">${input("first_name", "First name", "", "text", "required")}${input("last_name", "Last name", "", "text", "required")}${input("email", "Rider email", "", "email", "required")}${input("phone", "Phone", "", "tel", "required")}${input("password", "Initial password", "", "password", 'required minlength="8" autocomplete="new-password"')}</div>`,
      (form) =>
        request("/v1/logistics/riders", "POST", Object.fromEntries(form)),
    );
  }
  if (data.period) {
    const range = workspaceRange(Number(data.period));
    workspaceFrom = range.from;
    workspaceTo = range.to;
    await show("overview");
  }
  if (data.exportOverview && staffOverview?.sales) {
    const rows = [
      ["Date (Africa/Nairobi)", "Paid orders", "Net KES"],
      ...staffOverview.sales.trend.map((p) => [
        p.date,
        p.orders,
        p.net_minor / 100,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `cake-city-live-sales-${workspaceFrom}-${workspaceTo}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (data.enquiry) {
    const enquiry = enquiries.find((row) => row.id === data.enquiry);
    openEditor(
      "Customer response",
      `<div class="form-grid">${area("response", "Your response", enquiry.staff_response)}<label>Status<select name="status"><option value="reviewing">Reviewing</option>${enquiry.kind !== "support" ? '<option value="quoted">Send quote</option>' : ""}<option value="resolved">Resolved</option><option value="declined">Declined</option></select></label>${input("amount", "Quote amount (KES, when quoting)", "", "number", "min=1 step=0.01")}${input("expires", "Quote expiry (your local time, when quoting)", "", "datetime-local")}</div>`,
      async (form) => {
        const status = form.get("status");
        await request(
          `/v1/admin/enquiries/${encodeURIComponent(enquiry.id)}`,
          "PATCH",
          {
            revision: enquiry.revision,
            status,
            response: form.get("response"),
            quote_minor:
              status === "quoted"
                ? Math.round(Number(form.get("amount")) * 100)
                : null,
            quote_expires_at:
              status === "quoted" && form.get("expires")
                ? new Date(form.get("expires")).toISOString()
                : null,
          },
        );
      },
    );
  }
  if (data.riderTrip) {
    openEditor(
      "Update your delivery",
      `<p>${esc(data.status.replaceAll("_", " "))}</p>${area("note", "Delivery note")}${area("proof", "Receipt confirmation / proof reference (when delivered)")}`,
      async (form) => {
        await request(
          `/v1/rider/tasks/${encodeURIComponent(data.riderTrip)}`,
          "PATCH",
          {
            revision: Number(data.revision),
            status: data.status,
            note: form.get("note"),
            proof: form.get("proof"),
          },
        );
      },
    );
  }
});
setInterval(() => {
  if (
    !session ||
    document.hidden ||
    tab !== "overview" ||
    $("editor").open ||
    $("content").contains(document.activeElement)
  )
    return;
  void show("overview", true);
}, 30000);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-workspace-mode]");
  if (!button || !session || workspaceMode === button.dataset.workspaceMode)
    return;
  workspaceMode = button.dataset.workspaceMode;
  await show("overview");
});
