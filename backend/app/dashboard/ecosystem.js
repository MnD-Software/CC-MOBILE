/* Same authenticated APIs as the native workspaces. No credentials in URLs. */
function choices(name, label, options, value) {
  return `<fieldset class="choice-field"><legend>${esc(label)}</legend><div class="choice-chips">${options.map(([id, title]) => `<label><input type="radio" name="${esc(name)}" value="${esc(id)}" ${id === value ? "checked" : ""}>${esc(title)}</label>`).join("")}</div></fieldset>`;
}
function promotionFields(c) {
  return `${choices(
    "segment",
    "Customer segment",
    [
      "all",
      "new",
      "first_time",
      "repeat",
      "high_spenders",
      "inactive",
      "checkout_pending",
    ].map((s) => [s, s.replaceAll("_", " ")]),
    c?.segment || "all",
  )}${input("banner_url", "Banner image URL (HTTPS or uploaded asset)", c?.banner_url || "")}${input("title", "Customer-facing title", c?.title || "", "text", "maxlength=100")}${area("description", "Offer description", c?.description || "")}${choices(
    "discount_type",
    "Discount type",
    [
      ["fixed", "KES off"],
      ["percentage", "Percentage off"],
    ],
    c?.discount_type || "fixed",
  )}${input("percentage", "Percentage off (for percentage offers)", (c?.percentage_bps || 0) / 100, "number", "min=0 max=100 step=0.01")}${input("maximum", "Maximum saving KES (optional)", c?.maximum_minor ? c.maximum_minor / 100 : "", "number", "min=0.01 step=0.01")}${choices(
    "scope",
    "Discount applies to",
    [
      ["subtotal", "Products"],
      ["delivery", "Delivery fee"],
    ],
    c?.scope || "subtotal",
  )}${input("starts_at", "Start time (optional)", c?.starts_at ? localTime(c.starts_at) : "", "datetime-local")}${input("per_customer_limit", "Uses per customer (optional)", c?.per_customer_limit || "", "number", "min=1 max=1000000 step=1")}${input("product_ids", "Target product IDs (comma separated; empty for all)", c?.product_ids?.join(", ") || "")}${check("discoverable", "Show this offer on Home, Club and checkout", c?.discoverable)}${check("first_order_only", "First order only", c?.first_order_only)}`;
}
function promotionPayload(f) {
  return {
    segment: f.get("segment") || "all",
    banner_url: f.get("banner_url") || "",
    title: f.get("title"),
    description: f.get("description"),
    discount_type: f.get("discount_type") || "fixed",
    percentage_bps: Math.round(Number(f.get("percentage")) * 100),
    maximum_minor: f.get("maximum")
      ? Math.round(Number(f.get("maximum")) * 100)
      : null,
    scope: f.get("scope") || "subtotal",
    starts_at: f.get("starts_at")
      ? new Date(f.get("starts_at")).toISOString()
      : null,
    per_customer_limit: f.get("per_customer_limit")
      ? Number(f.get("per_customer_limit"))
      : null,
    product_ids: String(f.get("product_ids") || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map(Number),
    discoverable: f.has("discoverable"),
    first_order_only: f.has("first_order_only"),
  };
}
sections.marketing = [
  "M",
  "Marketing command centre",
  "Scheduled stories, discoverable offers and coupon redemption.",
];
views.marketing = async () => {
  const [stories, offers] = await Promise.all([
    request("/v1/admin/content"),
    request("/v1/admin/dashboard/promotions"),
  ]);
  const campaigns = stories.filter((c) => c.kind === "campaign"),
    now = Date.now();
  return `<div class="stats">${stat("Live campaigns", campaigns.filter((c) => c.published && Date.parse(c.starts_at) <= now && Date.parse(c.ends_at) > now).length, "Published now")}${stat("Scheduled", campaigns.filter((c) => c.published && Date.parse(c.starts_at) > now).length, "Upcoming launches")}${stat(
    "Coupon redemptions",
    offers.reduce((n, c) => n + c.uses, 0),
    "Includes local review redemptions; not sales revenue",
  )}</div><section class="panel"><h2>Make the next celebration sweeter</h2><p>Create fixed KES, percentage or delivery discounts. Publish them for discovery, or keep codes private. Set minimum spend, maximum saving, selected products, first-order rules, start/expiry times and account limits.</p><div class="workflow-actions"><button data-nav="campaigns">Campaign studio</button><button data-nav="promotions">Discount studio</button></div></section>${campaigns.map((c) => `<article class="panel"><h3>${esc(c.title)}</h3>${pill(!c.published ? "Draft" : Date.parse(c.ends_at) <= now ? "Ended" : Date.parse(c.starts_at) > now ? "Scheduled" : "Live")}<p>${esc(date(c.starts_at))} → ${esc(date(c.ends_at))}</p></article>`).join("")}`;
};

sections["service-desk"] = [
  "C",
  "Call centre",
  "Assigned requests, kitchen and dispatch handoffs, receipts and assisted-order reporting.",
];
let deskKind = "order",
  deskScope = "mine",
  deskPage = 1,
  deskSearch = "",
  deskRows = [],
  deskDetail = null;
views["service-desk"] = async () => {
  const data = await request(
    `/v1/service-desk/records?${new URLSearchParams({ kind: deskKind, scope: deskScope, page: String(deskPage), search: deskSearch })}`,
  );
  deskRows = data.items;
  return `<section class="panel"><form id="desk-search"><div class="choice-chips">${["order", "enquiry"].map((k) => `<button type="button" data-desk-kind="${k}" aria-pressed="${deskKind === k}">${k === "order" ? "Orders" : "Enquiries"}</button>`).join("")}${["mine", "unassigned", "all"].map((k) => `<button type="button" data-desk-scope="${k}" aria-pressed="${deskScope === k}">${k}</button>`).join("")}</div><label>Find an order reference or enquiry subject<input name="desk_search" value="${esc(deskSearch)}" maxlength="100"></label><button>Find cases</button></form><button data-desk-export>Export assisted orders</button></section><div class="cards">${data.items.map((c) => `<article class="panel" data-work="${esc(c.identity)}">${pill(c.status)} ${c.priority === "urgent" ? pill("Urgent") : ""}<h2>${esc(c.title)}</h2><p>${esc(c.agent_name || "Awaiting an agent")}</p>${c.follow_up_at ? `<p>Follow-up: ${esc(date(c.follow_up_at))}</p>` : ""}<button data-desk-open="${esc(c.identity)}">${c.agent_id ? "Open case" : "Claim & open"}</button></article>`).join("") || empty("Your desk is clear", "Choose Unassigned to pick up a new request.")}</div><div class="workflow-actions">${deskPage > 1 ? '<button data-desk-page="-1">Previous</button>' : ""}${data.has_more ? '<button data-desk-page="1">Next</button>' : ""}</div>`;
};
async function openDesk(identity) {
  const c = deskRows.find((r) => r.identity === identity);
  if (c && !c.agent_id)
    await request(
      `/v1/service-desk/records/${deskKind}/${encodeURIComponent(identity)}`,
      "PUT",
      { revision: c.revision },
    );
  const [d, agents] = await Promise.all([
    request(
      `/v1/service-desk/records/${deskKind}/${encodeURIComponent(identity)}`,
    ),
    request("/v1/service-desk/agents"),
  ]);
  deskDetail = d;
  const o = d.order;
  const history = o
    ? `<h3>Order journey</h3><p>${esc(o.status)} · ${esc(o.payment_state)} · ${money(o.total_minor)}</p><p>Production: ${esc(d.production?.plant || "Awaiting assignment")}</p>${(o.deliveries || []).map((t) => `<p>${esc(t.status)} · ${esc(t.rider?.name || "Rider pending")} · ${esc(t.rider?.phone || "")}</p>`).join("")}${(o.snapshot?.lines || []).map((l) => `<p>${esc(l.quantity)} × ${esc(l.name)} · ${esc(l.selection?.size || "")}</p>`).join("")}${(o.events || []).map((e) => `<p>${esc(e.kind.replaceAll("_", " "))} · ${esc(date(e.created_at))}</p>`).join("")}<button type="button" data-desk-receipt="${esc(d.identity)}">Download receipt</button>${(d.enquiries || []).map((e) => `<p>${esc(e.subject)} · ${esc(e.status)}<br>${esc(e.details)}</p>`).join("")}`
    : `<h3>Customer request</h3><p>${esc(d.enquiry.details)}</p><p>${esc(d.enquiry.staff_response || "")}</p>${area("customer_reply", "Reply to customer", "")}<div class="workflow-actions"><button type="button" data-desk-reply="reviewing">Reply & notify</button><button type="button" data-desk-reply="resolved">Resolve & notify</button></div>`;
  openEditor(
    d.title,
    `<div class="full"><h2>${esc(d.customer.name)}</h2><p>${esc(d.customer.email)} · ${esc(d.customer.phone)}</p>${d.checkout_contacts ? `<h3>Order purchaser</h3><p>${esc([d.checkout_contacts.first_name, d.checkout_contacts.last_name, d.checkout_contacts.email, d.checkout_contacts.phone].filter(Boolean).join(" - "))}</p><p>Recipient: ${esc(d.recipient?.recipient_name || "")} ${esc(d.recipient?.recipient_phone || "")}</p>` : ""}${history}</div>${choices(
      "priority",
      "Priority",
      [
        ["normal", "Normal"],
        ["urgent", "Urgent"],
      ],
      d.priority,
    )}${choices(
      "handoff",
      "Handoff",
      d.kind === "order"
        ? [
            ["agent", "Agent"],
            ["kitchen", "Kitchen"],
            ["dispatch", "Dispatch"],
          ]
        : [["agent", "Agent"]],
      "agent",
    )}${choices(
      "agent_id",
      "Responsible agent",
      agents.map((a) => [a.id, a.name]),
      d.agent_id,
    )}${input("follow_up_at", "Follow-up (optional)", d.follow_up_at ? localTime(d.follow_up_at) : "", "datetime-local")}${area("internal_note", "Internal instructions", "")}<div class="full"><h3>Internal history</h3>${d.notes.map((n) => `<p><strong>${esc(n.actor)} → ${esc(n.department)}</strong> · ${esc(date(n.at))}<br>${esc(n.note)}</p>`).join("")}</div>`,
    (f) =>
      request(
        `/v1/service-desk/records/${d.kind}/${encodeURIComponent(d.identity)}`,
        "PUT",
        {
          revision: d.revision,
          agent_id: f.get("agent_id"),
          priority: f.get("priority"),
          handoff: f.get("handoff"),
          note: f.get("internal_note"),
          follow_up_at: f.get("follow_up_at")
            ? new Date(f.get("follow_up_at")).toISOString()
            : null,
        },
      ),
  );
}
document.addEventListener("submit", (e) => {
  if (e.target.id !== "desk-search") return;
  e.preventDefault();
  deskSearch = new FormData(e.target).get("desk_search").trim();
  deskPage = 1;
  void show("service-desk");
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (!Object.keys(d).some((k) => k.startsWith("desk"))) return;
  b.disabled = true;
  try {
    if (d.deskKind) {
      deskKind = d.deskKind;
      deskPage = 1;
      await show("service-desk");
    } else if (d.deskScope) {
      deskScope = d.deskScope;
      deskPage = 1;
      await show("service-desk");
    } else if (d.deskPage) {
      deskPage += Number(d.deskPage);
      await show("service-desk");
    } else if (d.deskOpen) await openDesk(d.deskOpen);
    else if ("deskExport" in d)
      await scopedDownload(
        "/v1/service-desk/report.xlsx",
        "agent-assisted-orders.xlsx",
      );
    else if (d.deskReceipt)
      await scopedDownload(
        `/v1/service-desk/orders/${encodeURIComponent(d.deskReceipt)}/receipt`,
        "cake-city-receipt.html",
      );
    else if (d.deskReply) {
      const reply = $("fields")
        .querySelector('[name="customer_reply"]')
        .value.trim();
      if (reply.length < 3) throw Error("Write a meaningful response.");
      await request(`/v1/admin/enquiries/${deskDetail.enquiry.id}`, "PATCH", {
        revision: deskDetail.enquiry.revision,
        status: d.deskReply,
        response: reply,
      });
      await openDesk(deskDetail.identity);
    }
  } catch (error) {
    $("editor").open
      ? ($("editor-error").textContent = error.message)
      : notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});
sections.earnings = [
  "↗",
  "Rider earnings & payments",
  "Every trip, approval and recorded payment, reconciled.",
];
sections.corporate = [
  "◇",
  "Corporate relationships",
  "Clients, conversations and commercial documents.",
];
let earningRows = [],
  earningDays = 30,
  businessCompany = null,
  businessDetails = null,
  businessOwner = null;
const corporateStaff = () =>
  [
    "admin",
    "staff",
    "ecommerce_manager",
    "corporate_manager",
    "corporate_assistant",
    "corporate_agent",
    "corporate_sales",
  ].includes(session?.customer.role);
const corporateOnboard = () =>
  corporateStaff() && session?.customer.role !== "corporate_agent";

async function scopedDownload(path, filename) {
  const owner = session?.customer.id;
  await request("/v1/workspace/session"); // Refresh through the shared session boundary.
  const result = await fetch(path, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!result.ok)
    throw Error(
      "Your document could not be downloaded. Refresh your session and retry.",
    );
  const blob = await result.blob();
  if (session?.customer.id !== owner)
    throw Error("Your account changed. Retry the export.");
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

views.earnings = async () => {
  const from = new Date(Date.now() - earningDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const data = await request(`/v1/rider-earnings?from_date=${from}`);
  earningRows = data.trips;
  const manage = !["rider", "driver", "finance"].includes(
    session.customer.role,
  );
  return `<section class="ecosystem-hero emerald"><span class="eyebrow">EVERY MILE, ACCOUNTED FOR</span><h2>${manage ? "Rider payments" : "Your earnings"}</h2><p>Delivery earnings: KES 85 + KES 15/km. Recording a payment does not move money.</p><div class="stats">${stat("Earned", money(data.totals.earned_minor), "Completed deliveries")}${stat("Paid", money(data.totals.paid_minor), "Recorded transactions")}${stat("Approved balance", money(data.totals.balance_minor), "Awaiting payment")}</div></section><div class="ecosystem-actions">${[7, 30, 90].map((n) => `<button class="${n === earningDays ? "primary" : ""}" data-earnings-days="${n}">${n} days</button>`).join("")}<button data-ecosystem-download="/v1/rider-earnings/report.xlsx?from_date=${from}" data-filename="rider-payments.xlsx">Download Excel</button></div><div class="cards">${data.trips.map((t) => `<section class="panel workflow-card ${t.status === "paid" ? "earning-paid" : ""}"><span class="pill ${["paid", "approved"].includes(t.status) ? "good" : ""}">${esc(t.status.replaceAll("_", " "))}</span><h2>${esc(t.reference)}</h2><p>${esc(t.rider_name)} · ${esc(t.trip_status)}</p><strong class="earning-amount">${t.amount_minor === null ? "Fare awaiting confirmation" : money(t.amount_minor)}</strong><p>${t.distance_meters ? t.distance_meters / 1000 + " km · " : ""}Paid ${money(t.paid_minor)} · Balance ${money(t.balance_minor)}</p>${manage ? `<div class="workflow-actions">${["tariff_pending", "estimated", "earned"].includes(t.status) && t.service_type === "delivery" ? `<button data-earning="${esc(t.task_id)}" data-earning-mode="fare">Confirm distance & fare</button>` : ""}${t.status === "earned" ? `<button data-earning="${esc(t.task_id)}" data-earning-mode="approve">Approve earnings</button>` : ""}${["approved", "part_paid"].includes(t.status) ? `<button class="primary" data-earning="${esc(t.task_id)}" data-earning-mode="payment">Record payment</button>` : ""}</div>` : ""}${t.payments.length ? `<details><summary>Payment history · ${t.payments.length}</summary>${t.payments.map((p) => `<p>${money(p.amount_minor)} · ${esc(p.reference)} · ${esc(date(p.paid_at))}</p>`).join("")}</details>` : ""}</section>`).join("") || empty("No assigned trips", "Trip estimates and payment history will appear here.")}</div>`;
};

views.corporate = async () => {
  if (businessOwner !== session.customer.id) {
    businessOwner = session.customer.id;
    businessCompany = null;
    businessDetails = null;
  }
  const companies = await request("/v1/business/companies");
  if (businessCompany && !companies.some((c) => c.id === businessCompany))
    businessCompany = null;
  if (!businessCompany)
    return `<section class="ecosystem-hero"><span class="eyebrow">CAKE CITY / BUSINESS</span><h2>Great teams. Great celebrations.</h2><p>Your clients, conversations and commercial documents in one clear workspace.</p>${corporateOnboard() ? '<button data-business-new="client" class="primary">Add corporate client</button>' : ""}</section><div class="cards">${companies.map((c) => `<button class="panel company-tile" data-business-company="${esc(c.id)}"><span class="eyebrow">COMPANY ACCOUNT</span><h2>${esc(c.name)}</h2><p>${esc(c.billing_address)}</p><strong>Open account →</strong></button>`).join("") || empty("Your companies", "A corporate manager or assistant can create your account and provide access.")}</div>`;
  const d = await request(`/v1/business/companies/${businessCompany}`);
  businessDetails = d;
  return `<button data-business-back>← All companies</button><section class="ecosystem-hero"><span class="eyebrow">YOUR CORPORATE DESK</span><img class="company-brand" src="/admin/assets/cake-city-logo.png" alt="Cake City">${d.branding?.logo_url ? `<img class="company-brand" src="${esc(d.branding.logo_url)}" alt="${esc(d.name)} logo">` : ""}<p>${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, ${esc(session.customer.first_name || "there")}.</p><h2>${esc(d.name)}</h2><p>${esc(d.billing_address)}</p><div class="stats">${stat("Invoiced", money(d.totals.invoiced_minor), "Issued invoices")}${stat("Verified paid", money(d.totals.paid_minor), "Reconciled receipts")}${stat("Outstanding", money(d.totals.balance_minor), "Account balance")}</div></section><div class="ecosystem-actions">${[["quote", "New quotation"], ["lpo", "Add LPO"], ["payment", "Submit payment evidence"], ...(d.permissions.team ? [["crm", "Log CRM activity"]] : []), ...(d.permissions.onboard ? [["assign", "Assign team member"]] : [])].map(([kind, label]) => `<button data-business-new="${kind}">${label}</button>`).join("")}<button data-ecosystem-download="/v1/business/companies/${esc(d.id)}/report.xlsx" data-filename="corporate-statement.xlsx">Excel statement</button></div><h2>Commercial desk</h2><div class="cards">${d.documents.map((doc) => `<section class="panel"><div class="ecosystem-actions"><span class="eyebrow">${esc(doc.kind.toUpperCase())} · ${esc(doc.id.slice(0, 8).toUpperCase())}</span><span class="pill ${["verified", "accepted"].includes(doc.status) ? "good" : ""}">${esc(doc.status)}</span></div><h2>${money(doc.total_minor)}</h2><p>${esc(doc.reference)}</p><details><summary>${doc.lines.length} items · Details</summary>${doc.lines.map((l) => `<p>${l.quantity} × ${esc(l.name)} · ${money(l.total_minor)}</p>`).join("")}<p>${esc(doc.notes)}</p></details><div class="ecosystem-actions"><button data-ecosystem-download="/v1/business/companies/${esc(d.id)}/documents/${esc(doc.id)}/print" data-filename="cake-city-${esc(doc.kind)}.html">Download document</button>${["lpo", "payment"].includes(doc.kind) ? `<button data-business-attachment="${esc(doc.id)}">${doc.attachment_mime ? "Download evidence" : "Attach PDF / receipt"}</button>` : ""}${doc.kind === "quote" && doc.status === "accepted" && !d.permissions.team ? `<button data-company-checkout="${esc(doc.id)}">Order these cakes</button>` : ""}${doc.kind === "quote" && doc.status === "issued" && !d.permissions.team ? `<button data-business-status="accepted" data-document="${esc(doc.id)}">Accept quote</button><button data-business-status="rejected" data-document="${esc(doc.id)}">Decline</button>` : ""}${doc.kind === "quote" && ["requested", "issued"].includes(doc.status) && d.permissions.team ? `<button data-business-status="recalled" data-document="${esc(doc.id)}">Recall quote</button>` : ""}${doc.discount_minor ? `<p>Corporate saving ${money(doc.discount_minor)} - ${doc.discount_bps / 100}% - ${doc.cake_kg} kg</p>` : ""}${doc.kind === "quote" && doc.status === "requested" && d.permissions.team ? `<button data-business-status="issued" data-document="${esc(doc.id)}">Issue quote</button>` : ""}${doc.kind === "quote" && doc.status === "accepted" && d.permissions.team ? `<button data-business-invoice="${esc(doc.id)}">Create invoice</button>` : ""}${doc.kind === "payment" && doc.status === "submitted" && d.permissions.onboard ? `<button data-business-status="verified" data-document="${esc(doc.id)}">Verify receipt</button>` : ""}</div></section>`).join("") || empty("Start a celebration quotation", "Choose real inventory products and share a clear commercial document with your client.")}</div>${d.permissions.team ? `<h2>Relationship timeline</h2><div class="cards">${d.activities.map((a) => `<section class="panel"><span class="pill">${esc(a.stage)}</span><p>${esc(a.note)}</p><small>${esc(a.actor)} · ${esc(date(a.created_at))}</small>${a.follow_up_at ? `<p>Follow up ${esc(date(a.follow_up_at))}</p>` : ""}</section>`).join("") || "<p>No CRM activities recorded yet.</p>"}</div>` : ""}`;
};

function businessEditor(kind) {
  const root = `/v1/business/companies/${businessCompany}`,
    key = crypto.randomUUID();
  if (kind === "client") {
    openEditor(
      "Welcome a corporate client",
      `<div class="form-grid">${input("name", "Company name", "", "text", "required minlength=2 maxlength=160")}${input("billing_address", "Billing address", "", "text", "required minlength=5 maxlength=500")}${input("industry", "Industry")}${input("first_name", "Contact first name", "", "text", "required")}${input("last_name", "Contact last name", "", "text", "required")}${input("email", "Contact email", "", "email", "required")}${input("password", "Temporary password", "", "password", "required minlength=10 maxlength=128")}<p>Share access privately. Existing account passwords are preserved; no email is sent automatically.</p></div>`,
      (f) =>
        request("/v1/business/companies", "POST", {
          request_key: key,
          ...Object.fromEntries(f),
        }),
    );
    return;
  }
  if (kind === "crm") {
    openEditor(
      "Keep the relationship moving",
      `<fieldset><legend>CRM stage</legend><div class="segmented">${["lead", "contacted", "qualified", "proposal", "won", "follow_up", "closed"].map((s, i) => `<label><input required type="radio" name="stage" value="${s}" ${i === 1 ? "checked" : ""}>${s.replaceAll("_", " ")}</label>`).join("")}</div></fieldset>${area("note", "Conversation or next action")}${input("follow_up_at", "Follow-up date (optional)", "", "datetime-local")}`,
      (f) =>
        request(root + "/activities", "POST", {
          stage: f.get("stage"),
          note: f.get("note"),
          follow_up_at: f.get("follow_up_at")
            ? new Date(f.get("follow_up_at")).toISOString()
            : null,
        }),
    );
    return;
  }
  if (kind === "quote") {
    let inventory = [];
    const resultRows = () =>
      inventory
        .map(
          (p) =>
            `<label class="inventory-choice"><input type="checkbox" name="product-${p.id}" value="${p.id}"><span><strong>${esc(p.name)}</strong><small>${esc(p.label)} · ${money(p.price_minor)}</small></span><input aria-label="Quantity for ${esc(p.name)}" name="quantity-${p.id}" type="number" value="1" min="1" max="10000"></label>`,
        )
        .join("");
    const load = async (query) => {
      inventory = await request(
        "/v1/business/inventory?search=" + encodeURIComponent(query),
      );
      document.getElementById("business-inventory").innerHTML = resultRows();
    };
    openEditor(
      "Build a quotation",
      `${input("inventory_search", "Find inventory products")}<button type="button" id="business-search">Find products</button><div id="business-inventory" class="inventory-choices">Loading inventory…</div>${area("notes", "Design, delivery date and requirements")}<p>Prices come from inventory; only staff can issue a quotation for acceptance. Quantity and delivery are subject to confirmation.</p>`,
      (f) =>
        request(root + "/documents", "POST", {
          request_key: key,
          kind: "quote",
          notes: f.get("notes"),
          lines: inventory
            .filter((p) => f.has("product-" + p.id))
            .map((p) => ({
              product_id: p.id,
              quantity: Number(f.get("quantity-" + p.id)),
            })),
        }),
    );
    document.getElementById("business-search").onclick = () =>
      void load(
        document.querySelector('[name="inventory_search"]').value,
      ).catch((e) => {
        document.getElementById("editor-error").textContent = e.message;
      });
    void load("").catch((e) => {
      document.getElementById("editor-error").textContent = e.message;
    });
    return;
  }
  if (kind === "assign") {
    void request("/v1/business/team")
      .then((team) =>
        openEditor(
          "Assign client team",
          `<fieldset><legend>Corporate team member</legend>${team.map((p) => `<label class="inventory-choice"><input required type="radio" name="customer_id" value="${esc(p.id)}"><span>${esc(p.name)} · ${esc(p.role)}</span></label>`).join("")}</fieldset>`,
          (f) =>
            request(root + "/assignments", "PUT", {
              customer_id: f.get("customer_id"),
            }),
        ),
      )
      .catch((e) => notice(e.message, true));
    return;
  }
  const choices = businessDetails.documents.filter(
    (d) =>
      d.kind === (kind === "payment" ? "invoice" : "quote") &&
      !["draft", "rejected", "recalled"].includes(d.status),
  );
  openEditor(
    kind === "payment" ? "Payment evidence" : "Purchase order",
    `<fieldset><legend>Linked ${kind === "payment" ? "invoice" : "quotation"}</legend>${choices.map((d) => `<label class="inventory-choice"><input required type="radio" name="linked_id" value="${esc(d.id)}"><span>${esc(d.id.slice(0, 8))} · ${money(d.total_minor)}</span></label>`).join("")}</fieldset>${input("reference", kind === "payment" ? "Payment reference" : "LPO reference", "", "text", "required minlength=3 maxlength=160")}${kind === "payment" ? input("amount", "Amount paid (KES)", "", "number", "required min=0.01 step=0.01") : ""}${area("notes", "Notes")}<p>Payment evidence needs manager verification before the account balance changes.</p>`,
    (f) =>
      request(root + "/documents", "POST", {
        request_key: key,
        kind,
        linked_id: f.get("linked_id"),
        reference: f.get("reference"),
        notes: f.get("notes"),
        amount_minor: Math.round(Number(f.get("amount") || 0) * 100),
      }),
  );
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !session) return;
  const d = button.dataset;
  try {
    if (d.earningsDays) {
      earningDays = Number(d.earningsDays);
      await show("earnings");
    }
    if (d.ecosystemDownload) {
      button.disabled = true;
      try {
        await scopedDownload(d.ecosystemDownload, d.filename);
      } finally {
        button.disabled = false;
      }
    }
    if (d.earning) {
      const trip = earningRows.find((t) => t.task_id === d.earning);
      if (!trip) return;
      const root = "/v1/rider-earnings/" + trip.task_id;
      if (d.earningMode === "approve") {
        await request(root + "/approve", "POST", {});
        await show("earnings");
      } else if (d.earningMode === "fare")
        openEditor(
          "Confirm rider fare",
          input(
            "distance",
            "Confirmed road distance (km)",
            trip.distance_meters ? trip.distance_meters / 1000 : "",
            "number",
            "required min=0.001 max=500 step=0.001",
          ) +
            "<p>Use actual road distance. This does not change the customer delivery fee.</p>",
          (f) =>
            request(root + "/estimate", "PUT", {
              distance_meters: Math.round(Number(f.get("distance")) * 1000),
            }),
        );
      else {
        const key = crypto.randomUUID();
        openEditor(
          "Record completed rider payment",
          input(
            "amount",
            "Amount paid (KES)",
            trip.balance_minor / 100,
            "number",
            "required min=0.01 step=0.01",
          ) +
            input(
              "reference",
              "Transaction reference",
              "",
              "text",
              "required minlength=3 maxlength=160",
            ) +
            input(
              "paid_at",
              "Payment date",
              localTime(new Date().toISOString()),
              "datetime-local",
              "required",
            ) +
            "<p>Record an actual completed payment. This does not transfer money.</p>",
          (f) =>
            request(root + "/payments", "POST", {
              request_key: key,
              amount_minor: Math.round(Number(f.get("amount")) * 100),
              reference: f.get("reference"),
              paid_at: new Date(f.get("paid_at")).toISOString(),
            }),
        );
      }
    }
    if (d.businessCompany) {
      businessCompany = d.businessCompany;
      await show("corporate");
    }
    if ("businessBack" in d) {
      businessCompany = null;
      await show("corporate");
    }
    if (d.businessNew) businessEditor(d.businessNew);
    if (d.businessAttachment) {
      const target = businessDetails.documents.find(
        (x) => x.id === d.businessAttachment,
      );
      if (!target) return;
      const existing = target.attachment_mime;
      if (existing) {
        await scopedDownload(
          `/v1/business/companies/${businessCompany}/documents/${target.id}/attachment`,
          `cake-city-evidence.${existing === "application/pdf" ? "pdf" : existing === "image/png" ? "png" : "jpg"}`,
        );
      } else {
        const chooser = document.createElement("input");
        chooser.type = "file";
        chooser.accept = "application/pdf,image/jpeg,image/png";
        chooser.onchange = async () => {
          try {
            const file = chooser.files?.[0];
            if (!file) return;
            if (file.size > 2000000)
              throw Error("Choose a PDF, JPEG or PNG under 2 MB.");
            const data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            await request(
              `/v1/business/companies/${businessCompany}/documents/${target.id}/attachment`,
              "PUT",
              { mime: file.type, data },
            );
            await show("corporate");
          } catch (error) {
            notice(error.message || "Attachment upload failed.", true);
          }
        };
        chooser.click();
      }
    }
    if (d.businessStatus) {
      const doc = businessDetails.documents.find((x) => x.id === d.document);
      await request(
        `/v1/business/companies/${businessCompany}/documents/${doc.id}/status`,
        "POST",
        { revision: doc.revision, status: d.businessStatus },
      );
      await show("corporate");
    }
    if (d.businessInvoice) {
      await request(
        `/v1/business/companies/${businessCompany}/documents`,
        "POST",
        {
          request_key: "invoice-" + d.businessInvoice,
          kind: "invoice",
          linked_id: d.businessInvoice,
        },
      );
      await show("corporate");
    }
  } catch (error) {
    notice(error.message, true);
  }
});

function installPromotionPreview() {
  const form = document.getElementById("edit-form");
  if (!form) return;
  const panel = document.createElement("section");
  panel.className = "panel full";
  panel.setAttribute("aria-label", "Customer promotion preview");
  document.getElementById("fields").append(panel);
  const jump = document.createElement("button");
  jump.type = "button";
  jump.className = "quiet";
  jump.textContent = "Preview this offer";
  jump.onclick = () =>
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("fields").prepend(jump);
  const update = () => {
    const f = new FormData(form);
    const percent = f.get("discount_type") === "percentage";
    const image = String(f.get("banner_url") || "");
    const safe =
      /^https:\/\//.test(image) ||
      /^\/v1\/content\/assets\/[a-f0-9]{64}$/.test(image);
    panel.innerHTML = `<h3>Customer preview - unsaved</h3><article class="promotion-preview">${safe ? `<img src="${esc(image)}" alt="Promotion artwork" class="promotion-preview-image">` : ""}<div class="promotion-preview-hero"><small>YOUR LITTLE EXTRA</small><h2 class="promotion-preview-title">${esc(percent ? String(Number(f.get("percentage"))) + "%" : money(Number(f.get("amount")) * 100))} OFF</h2><p>${esc(f.get("title") || "A little more celebration")}</p></div><div class="promotion-preview-terms"><strong>Select this offer at checkout</strong><p>Min. ${money(Number(f.get("minimum")) * 100)}${f.get("scope") === "delivery" ? " - delivery fee" : ""}</p><p>${esc(f.get("description") || "")}</p><small>One coupon per order. Final eligibility is checked at checkout.</small></div></article><p class="help">Edits are private until saved. Enable discovery and set the start time to publish without rebuilding the app.</p><label class="full">Upload banner artwork<input type="file" accept="image/png,image/jpeg" data-promo-artwork></label>`;
    panel.querySelector("[data-promo-artwork]").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2000000) {
        notice("Use a PNG or JPEG under 2 MB", true);
        return;
      }
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const asset = await request("/v1/admin/content/assets", "POST", {
          mime: file.type,
          data,
        });
        form.querySelector('[name="banner_url"]').value = asset.url;
        update();
      } catch (error) {
        notice(error.message, true);
      }
    };
  };
  if (form.cakeCityPreviewUpdate) {
    form.removeEventListener("input", form.cakeCityPreviewUpdate);
    form.removeEventListener("change", form.cakeCityPreviewUpdate);
  }
  form.cakeCityPreviewUpdate = update;
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

async function marketingAudiences() {
  const d = await request("/v1/admin/marketing/segments");
  return `<section class="panel"><h2>Customer audiences</h2><p>${esc(d.definition)}</p><div class="choice-chips">${d.segments.map((s) => `<button data-marketing-segment="${esc(s.id)}">${esc(s.label)} - ${s.count}</button>`).join("")}</div><div id="marketing-clients"></div><button data-marketing-settings>Segment & reminder settings</button></section>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.marketingSegment) {
      const segment = b.dataset.marketingSegment;
      const data = await request(
        "/v1/admin/marketing/clients?segment=" +
          encodeURIComponent(segment) +
          "&page=1",
      );
      $("marketing-clients").innerHTML =
        table(
          ["Client", "Purchases", "Live net spend", "Consent"],
          data.items.map(
            (p) =>
              `<tr><td>${esc(p.name)}<br>${esc(p.email)}<br>${esc(p.phone || "")}</td><td>${p.purchases}</td><td>${money(p.net_spend_minor)}</td><td>${p.marketing_consent ? "Opted in" : "Not opted in"}</td></tr>`,
          ),
        ) +
        `<p>${data.total} clients. Showing the first 20. Use the native Audiences workspace for paginated browsing.</p>`;
    }
    if ("marketingSettings" in b.dataset) {
      const d = await request("/v1/admin/marketing/segments");
      const c = d.settings;
      openEditor(
        "Customer segmentation & reminders",
        `${input("high_spender", "High spender net spend KES", c.high_spender_minor / 100, "number", "required min=100")}${input("inactive_days", "Inactive after days", c.inactive_days, "number", "required min=7 max=730")}${input("minutes", "Checkout reminder after minutes", c.reminder_minutes, "number", "required min=15 max=1440")}${check("enabled", "Enable reminders for opted-in customers", c.reminders_enabled)}<p>One reminder per customer per day. Requires the notification worker; remote push also requires configured delivery.</p>`,
        (f) =>
          request("/v1/admin/marketing/settings", "PUT", {
            high_spender_minor: Math.round(Number(f.get("high_spender")) * 100),
            inactive_days: Number(f.get("inactive_days")),
            reminder_minutes: Number(f.get("minutes")),
            reminders_enabled: f.has("enabled"),
          }),
      );
    }
  } catch (error) {
    notice(error.message, true);
  }
});
const marketingWithoutAudiences = views.marketing;
views.marketing = async () =>
  `${await marketingAudiences()}${await marketingWithoutAudiences()}`;
const overviewWithoutFunnel = views.overview;
views.overview = async () => {
  const base = await overviewWithoutFunnel();
  if (!["admin", "staff", "ecommerce_manager"].includes(session?.customer.role))
    return base;
  const f = await request("/v1/admin/operations/funnel");
  return (
    base +
    `<section class="panel"><h2>The whole operation</h2><p>${esc(f.definition)}</p><div class="stats">${f.stages.map((s) => stat(s.label, s.count, "App operations")).join("")}</div></section>`
  );
};

sections.compliance = [
  "P",
  "Tax & privacy desk",
  "Buyer PIN requests, data rights and operational readiness.",
];
let complianceState = null;
views.compliance = async () => {
  const d = await request("/v1/admin/compliance");
  complianceState = d;
  return `<section class="panel"><h2>eTIMS: not connected</h2><p>PIN capture does not constitute a fiscal invoice or KRA certification.</p>${d.etims.requires.map((v) => `<p>${esc(v)}</p>`).join("")}<button data-compliance-settings>Business & privacy settings</button></section><h2>Buyer PIN requests</h2>${table(
    ["Order", "Buyer PIN", "Status"],
    d.tax_requests.map(
      (r) =>
        `<tr><td>${esc(r.reference)}</td><td>${esc(r.buyer_pin)}</td><td>${esc(r.state)}</td></tr>`,
    ),
  )}<h2>Data rights requests</h2><div class="cards">${d.privacy_requests.map((r) => `<section class="panel"><h3>${esc(r.kind)} - ${esc(r.status)}</h3><p>${esc(r.details)}</p><p>${esc(r.response || "")}</p><button data-privacy-reply="${esc(r.id)}">Review & respond</button></section>`).join("")}</div>`;
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !complianceState) return;
  if ("complianceSettings" in b.dataset) {
    const c = complianceState.settings;
    openEditor(
      "Business & privacy settings",
      Object.entries(c)
        .map(([k, v]) =>
          typeof v === "boolean"
            ? check(k, k.replaceAll("_", " "), v)
            : area(k, k.replaceAll("_", " "), v),
        )
        .join(""),
      (f) =>
        request(
          "/v1/admin/compliance/settings",
          "PUT",
          Object.fromEntries(
            Object.entries(c).map(([k, v]) => [
              k,
              typeof v === "boolean" ? f.has(k) : f.get(k),
            ]),
          ),
        ),
    );
  }
  if (b.dataset.privacyReply) {
    const id = b.dataset.privacyReply;
    openEditor(
      "Respond to privacy request",
      `${choices(
        "status",
        "Status",
        [
          ["reviewing", "Reviewing"],
          ["fulfilled", "Fulfilled"],
          ["declined", "Declined"],
        ],
        "reviewing",
      )}${area("response", "Response to customer", "")}`,
      (f) =>
        request("/v1/admin/compliance/privacy/" + id, "PATCH", {
          status: f.get("status"),
          response: f.get("response"),
        }),
    );
  }
});

document.addEventListener("change", (e) => {
  const ref = e.target.dataset.bulkReference;
  if (!ref) return;
  if (e.target.checked) {
    if (queueSelection.size >= 20) {
      e.target.checked = false;
      notice("Select up to 20 orders per batch.", true);
      return;
    }
    queueSelection.add(ref);
  } else queueSelection.delete(ref);
});
async function runQueueBatch(action, rider) {
  if (!queueSelection.size) throw Error("Select at least one order.");
  const data = await request("/v1/logistics/bulk-work", "POST", {
    references: [...queueSelection],
    action,
    rider_id: rider || null,
  });
  for (const r of data.results) if (r.ok) queueSelection.delete(r.reference);
  await show(tab);
  notice(
    data.results
      .map((r) =>
        r.ok ? r.reference + ": updated" : r.reference + ": " + r.message,
      )
      .join(" "),
    data.results.some((r) => !r.ok),
  );
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.bulkWork) {
      b.disabled = true;
      await runQueueBatch(b.dataset.bulkWork);
    } else if ("bulkClear" in b.dataset) {
      queueSelection.clear();
      await show(tab);
    } else if ("bulkAssign" in b.dataset) {
      if (!queueSelection.size) throw Error("Select orders first.");
      const riders = await request("/v1/logistics/riders");
      openEditor(
        "Assign selected orders",
        choices(
          "rider_id",
          "Choose rider",
          riders.map((r) => [r.id, r.name]),
          "",
        ),
        (f) => runQueueBatch("assign_rider", f.get("rider_id")),
      );
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});

globalThis.clearCakeCityWorkSelection = () => {
  queueSelection.clear();
  deskRows = [];
  deskDetail = null;
  complianceState = null;
};

let companyCheckout = null;
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b?.dataset.companyCheckout) return;
  try {
    const id = b.dataset.companyCheckout;
    const basket = await request(
      `/v1/business/companies/${businessCompany}/documents/${id}/basket`,
    );
    const c = session.customer;
    openEditor(
      "Order your company cakes",
      `${input("first_name", "First name", c.first_name || "", "text", "required")}${input("last_name", "Last name", c.last_name || "", "text", "required")}${input("email", "Email", c.email || "", "email", "required")}${input("phone", "Phone", c.phone || "", "tel", "required")}<p>Collect from HQ. Your approved corporate savings will appear in the confirmed total. Delivery ordering is available in your native corporate portal.</p>${area("notes", "Order notes", "")}`,
      async (f) => {
        const q = await request("/v1/app-checkout/quote", "POST", {
          corporate_quote_id: id,
          items: basket.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            ...l.selection,
          })),
          fulfilment: "pickup",
          pickup_location_id: "hq",
          billing: {
            first_name: f.get("first_name"),
            last_name: f.get("last_name"),
            email: f.get("email"),
            phone: f.get("phone"),
          },
          notes: f.get("notes") || "",
        });
        companyCheckout = { quote: q, key: crypto.randomUUID(), owner: c.id };
      },
    );
  } catch (error) {
    notice(error.message, true);
  }
});
const companyViewWithoutCheckout = views.corporate;
views.corporate = async () => {
  let html = await companyViewWithoutCheckout();
  if (businessCompany) {
    const orders = await request(
      `/v1/business/companies/${businessCompany}/orders`,
    );
    html += `<h2>Company orders</h2>${table(
      ["Order", "Status", "Value"],
      orders.map(
        (o) =>
          `<tr><td>${esc(o.reference)}</td><td>${esc(o.status)}${o.can_open && ["not_started", "pending"].includes(o.payment_state) ? `<button data-company-pay="${esc(o.reference)}">Continue payment</button>` : ""}</td><td>${money(o.total_minor)}</td></tr>`,
      ),
    )}`;
  }
  if (companyCheckout && companyCheckout.owner === session?.customer.id) {
    const q = companyCheckout.quote;
    html += `<section class="panel"><h2>Your confirmed order total</h2><p>Products ${money(q.subtotal_minor)} - corporate savings ${money(q.discount_minor)}</p><h2>${money(q.total_minor)}</h2><button class="primary" data-company-confirm>Confirm order</button><p>Availability and quotation expiry are checked again when you confirm.</p></section>`;
  }
  return html;
};
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-company-confirm]");
  if (!b || !companyCheckout || companyCheckout.owner !== session?.customer.id)
    return;
  b.disabled = true;
  try {
    let local = false;
    const capability = await fetch("/v1/review-checkout/config", {
      headers: { Authorization: "Bearer " + session.access_token },
      cache: "no-store",
    });
    if (capability.ok) local = (await capability.json()).enabled === true;
    else if (capability.status !== 404)
      throw Error("Checkout availability could not be confirmed.");
    const order = await request(
      local ? "/v1/review-checkout/orders" : "/v1/app-orders",
      "POST",
      { quote_id: companyCheckout.quote.id },
      true,
      { "Idempotency-Key": companyCheckout.key },
    );
    companyCheckout = null;
    if (order.payment_state === "completed") {
      await show("corporate");
      notice("Your order is confirmed.");
      return;
    }
    await show("corporate");
    notice(
      "Order created. Use Continue payment in company orders to confirm payment.",
    );
  } catch (error) {
    notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-company-pay]");
  if (!b) return;
  b.disabled = true;
  try {
    const payment = await request(
      `/v1/payments/pesapal/orders/${b.dataset.companyPay}/start`,
      "POST",
      {},
    );
    const url = new URL(payment.payment_url || "");
    if (
      !["pay.pesapal.com", "cybqa.pesapal.com"].includes(url.hostname) ||
      url.protocol !== "https:"
    )
      throw Error("Payment link could not be validated.");
    openEditor(
      "Secure payment",
      `<p>Order ${esc(payment.reference)}</p><a class="button" target="_blank" rel="noopener noreferrer" href="${esc(url.href)}">Open secure Pesapal payment</a><p>After payment, return here to view your order.</p>`,
      () => Promise.resolve(),
      true,
    );
  } catch (error) {
    notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});
