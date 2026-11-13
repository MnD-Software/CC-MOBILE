/* Same authenticated APIs as the native workspaces. No credentials in URLs. */
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
  return `<button data-business-back>← All companies</button><section class="ecosystem-hero"><span class="eyebrow">YOUR CORPORATE DESK</span><h2>${esc(d.name)}</h2><p>${esc(d.billing_address)}</p><div class="stats">${stat("Invoiced", money(d.totals.invoiced_minor), "Issued invoices")}${stat("Verified paid", money(d.totals.paid_minor), "Reconciled receipts")}${stat("Outstanding", money(d.totals.balance_minor), "Account balance")}</div></section><div class="ecosystem-actions">${[["quote", "New quotation"], ["lpo", "Add LPO"], ["payment", "Submit payment evidence"], ...(d.permissions.team ? [["crm", "Log CRM activity"]] : []), ...(d.permissions.onboard ? [["assign", "Assign team member"]] : [])].map(([kind, label]) => `<button data-business-new="${kind}">${label}</button>`).join("")}<button data-ecosystem-download="/v1/business/companies/${esc(d.id)}/report.xlsx" data-filename="corporate-statement.xlsx">Excel statement</button></div><h2>Commercial desk</h2><div class="cards">${d.documents.map((doc) => `<section class="panel"><div class="ecosystem-actions"><span class="eyebrow">${esc(doc.kind.toUpperCase())} · ${esc(doc.id.slice(0, 8).toUpperCase())}</span><span class="pill ${["verified", "accepted"].includes(doc.status) ? "good" : ""}">${esc(doc.status)}</span></div><h2>${money(doc.total_minor)}</h2><p>${esc(doc.reference)}</p><details><summary>${doc.lines.length} items · Details</summary>${doc.lines.map((l) => `<p>${l.quantity} × ${esc(l.name)} · ${money(l.total_minor)}</p>`).join("")}<p>${esc(doc.notes)}</p></details><div class="ecosystem-actions"><button data-ecosystem-download="/v1/business/companies/${esc(d.id)}/documents/${esc(doc.id)}/print" data-filename="cake-city-${esc(doc.kind)}.html">Download document</button>${["lpo", "payment"].includes(doc.kind) ? `<button data-business-attachment="${esc(doc.id)}">${doc.attachment_mime ? "Download evidence" : "Attach PDF / receipt"}</button>` : ""}${doc.kind === "quote" && doc.status === "issued" && !d.permissions.team ? `<button data-business-status="accepted" data-document="${esc(doc.id)}">Accept quote</button><button data-business-status="rejected" data-document="${esc(doc.id)}">Decline</button>` : ""}${doc.kind === "quote" && doc.status === "requested" && d.permissions.team ? `<button data-business-status="issued" data-document="${esc(doc.id)}">Issue quote</button>` : ""}${doc.kind === "quote" && doc.status === "accepted" && d.permissions.team ? `<button data-business-invoice="${esc(doc.id)}">Create invoice</button>` : ""}${doc.kind === "payment" && doc.status === "submitted" && d.permissions.onboard ? `<button data-business-status="verified" data-document="${esc(doc.id)}">Verify receipt</button>` : ""}</div></section>`).join("") || empty("Start a celebration quotation", "Choose real inventory products and share a clear commercial document with your client.")}</div>${d.permissions.team ? `<h2>Relationship timeline</h2><div class="cards">${d.activities.map((a) => `<section class="panel"><span class="pill">${esc(a.stage)}</span><p>${esc(a.note)}</p><small>${esc(a.actor)} · ${esc(date(a.created_at))}</small>${a.follow_up_at ? `<p>Follow up ${esc(date(a.follow_up_at))}</p>` : ""}</section>`).join("") || "<p>No CRM activities recorded yet.</p>"}</div>` : ""}`;
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
      !["draft", "rejected"].includes(d.status),
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
