"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format((n || 0) / 100);
const pill = (text, good = false) =>
  `<span class="pill ${good ? "good" : ""}">${esc(text)}</span>`;
const date = (s) =>
  s
    ? new Date(s).toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "No expiry";
const list = (s) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area = (name, label, value = "") =>
  `<label class="full">${label}<textarea name="${name}">${esc(value)}</textarea></label>`;
const check = (name, label, value = false) =>
  `<label class="check full"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
const empty = (title, text) =>
  `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const localTime = (s) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
let staffOverview = null,
  session = null,
  refreshPromise = null,
  tab = "overview",
  page = 1,
  search = "",
  state = "all",
  products = [],
  campaigns = [],
  promotions = [],
  deliverySettings = null,
  checkoutSettings = null,
  editorSave = null,
  generation = 0;
const operatorRoles = ["admin", "staff", "ecommerce_manager"],
  writerRoles = [...operatorRoles, "marketing_manager", "content_manager"],
  readerRoles = [...writerRoles, "executive", "analyst"],
  reportRoles = [...operatorRoles, "executive", "finance", "analyst"];
const fulfilmentRoles = [
  "admin",
  "staff",
  "ecommerce_manager",
  "production",
  "dispatch",
  "branch_manager",
  "customer_service",
];
const canFulfil = () => fulfilmentRoles.includes(session?.customer.role);
const canKitchen = () =>
  ["admin", "staff", "ecommerce_manager", "production", "head_chef"].includes(
    session?.customer.role,
  );
const canDispatch = () =>
  [
    "admin",
    "staff",
    "ecommerce_manager",
    "dispatch",
    "branch_dispatch",
    "branch_manager",
  ].includes(session?.customer.role);
const canOperate = () => operatorRoles.includes(session?.customer.role);
const canWrite = () => writerRoles.includes(session?.customer.role);
const canReport = () => reportRoles.includes(session?.customer.role);
async function request(path, method = "GET", body, retry = true) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 && session && retry) {
    if (!refreshPromise)
      refreshPromise = (async () => {
        const refreshed = await fetch("/v1/auth/mobile/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (!refreshed.ok)
          throw Error("Your session expired. Please sign in again.");
        session = await refreshed.json();
      })().finally(() => {
        refreshPromise = null;
      });
    try {
      await refreshPromise;
      return request(path, method, body, false);
    } catch (error) {
      signedOut();
      throw error;
    }
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail
              .map((x) => `${x.loc.slice(1).join(" ")}: ${x.msg}`)
              .join("; ")
          : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? null : response.json();
}
function signedOut() {
  staffOverview = null;
  session = null;
  generation++;
  $("workspace").hidden = true;
  $("login").hidden = false;
  $("content").replaceChildren();
  $("editor").close();
  $("signin").reset();
}
$("signin").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  $("login-error").textContent = "";
  try {
    const f = new FormData(e.target);
    session = await request(
      "/v1/auth/mobile/login",
      "POST",
      Object.fromEntries(f),
    );
    try {
      staffOverview = session.customer.role === "corporate_client" ? {modules:[{id:"corporate",label:"Your company"}]} : await request("/v1/staff/overview");
    } catch (error) {
      await request("/v1/auth/mobile/logout", "POST", {
        refresh_token: session.refresh_token,
      }).catch(() => {});
      throw error;
    }
    $("signin").reset();
    $("login").hidden = true;
    $("workspace").hidden = false;
    $("identity").textContent =
      `${session.customer.first_name} · ${session.customer.role.replaceAll("_", " ")}`;
    navigation();
    await show(session.customer.role === "corporate_client" ? "corporate" : "overview");
  } catch (error) {
    session = null;
    $("login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("signout").onclick = async () => {
  try {
    await request("/v1/auth/mobile/logout", "POST", {
      refresh_token: session.refresh_token,
    });
  } finally {
    signedOut();
  }
};
const sections = {
  kitchen: [
    "K",
    "Kitchen & production",
    "HQ preparation queue, cake variations and order instructions.",
  ],
  dispatch: [
    "D",
    "Dispatch & delivery",
    "Assign riders, dispatch deliveries and confirm delivery or branch collection.",
  ],
  payments: [
    "P",
    "Payments",
    "Verified provider payments and explicitly labelled simulated test orders.",
  ],
  club: [
    "C",
    "Customers & Club",
    "Member balances, qualifying spend and traceable purchase activity.",
  ],
  delivery: [
    "↗",
    "Checkout & delivery",
    "HQ dispatch, delivery boundaries and payment readiness.",
  ],
  overview: ["◈", "Overview", "A clear view of your app store."],
  products: [
    "▦",
    "Products",
    "Edit your catalogue, app prices and made-to-order availability.",
  ],
  campaigns: [
    "◇",
    "Campaigns",
    "Create, schedule and publish stories in the app.",
  ],
  promotions: [
    "%",
    "Promotions",
    "Manage discount codes enforced by app checkout.",
  ],
  orders: [
    "▤",
    "Orders",
    "Follow app orders from verified payment to fulfilment.",
  ],
  sales: [
    "↗",
    "Channel sales",
    "Compare verified sales from the app and website.",
  ],
  issues: ["◎", "Issues", "Track app and website issues separately."],
};
function navigation() {
  const allowed = (staffOverview?.modules || [])
    .map((module) => module.id)
    .filter((id) => sections[id]);
  document.querySelector("nav").innerHTML = allowed
    .map(
      (key) =>
        `<button data-nav="${key}"><span>${sections[key][0]}</span>${sections[key][1]}</button>`,
    )
    .join("");
}
function notice(text, error = false) {
  $("notice").hidden = false;
  $("notice").className = error ? "error" : "";
  $("notice").textContent = text;
}
async function show(next = tab, quiet = false) {
  if (!staffOverview?.modules.some((module) => module.id === next)) {
    notice("This section is outside your workspace.", true);
    return;
  }
  tab = next;
  const current = ++generation;
  $("title").textContent = sections[tab][1];
  $("breadcrumb").textContent = sections[tab][1];
  $("subtitle").textContent = sections[tab][2];
  $("notice").hidden = true;
  $("create").hidden = !(
    (tab === "products" && canOperate()) ||
    (tab === "campaigns" && canWrite()) ||
    (tab === "promotions" && canOperate())
  );
  $("create").textContent =
    {
      products: "+ Add product",
      campaigns: "+ New campaign",
      promotions: "+ New promotion",
    }[tab] || "";
  document.querySelectorAll("[data-nav]").forEach((n) => {
    n.classList.toggle("active", n.dataset.nav === tab);
    n.setAttribute("aria-current", n.dataset.nav === tab ? "page" : "false");
  });
  if (!quiet)
    $("content").innerHTML = '<div class="loading">Loading workspace…</div>';
  try {
    const html = await views[tab]();
    if (current === generation) $("content").innerHTML = html;
  } catch (error) {
    if (current === generation) {
      $("content").innerHTML =
        empty(
          "This section could not load",
          "Your existing data is kept. Please try again.",
        ) + `<button data-action="retry">Try again</button>`;
      notice(error.message, true);
    }
  }
}
const stat = (label, value, note) =>
  `<div class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`;
function orderActions(o) {
  if (o.payment_state !== "completed") return "Awaiting payment";
  const kitchen = ["paid", "preparing"].includes(o.status);
  if (
    !(kitchen ? canKitchen() : canDispatch()) ||
    !["paid", "preparing", "ready", "out_for_delivery"].includes(o.status)
  )
    return "";
  return `<button data-nav="${kitchen ? "kitchen" : "dispatch"}">Open ${kitchen ? "kitchen" : "dispatch"}</button>`;
}
async function workflowBoard(stage) {
  const kitchen = stage === "kitchen";
  const [all, tasks] = await Promise.all([
    request(kitchen ? "/v1/kitchen/orders" : "/v1/logistics/orders"),
    kitchen ? Promise.resolve([]) : request("/v1/logistics/tasks"),
  ]);
  const rows = all.filter((o) =>
    (kitchen
      ? ["paid", "preparing", "ready"]
      : ["ready", "out_for_delivery"]
    ).includes(o.status),
  );
  const cards = rows
    .map((o) => {
      const trips = tasks.filter(
        (t) => t.reference === o.reference && t.status !== "cancelled",
      );
      const allocated = trips.reduce(
        (sum, t) => sum + t.items.reduce((n, i) => n + i.quantity, 0),
        0,
      );
      const remaining = o.items.reduce((n, i) => n + i.quantity, 0) - allocated;
      let actions = "";
      if (kitchen) {
        if (!o.assigned_to)
          actions += `<button data-kitchen-assign="${esc(o.reference)}">Assign production to me</button>`;
        else if (["paid", "preparing"].includes(o.status))
          actions += `<button data-kitchen-order="${esc(o.reference)}" data-status="${o.status === "paid" ? "preparing" : "ready"}">${o.status === "paid" ? "Start preparation" : "Kitchen complete — ready for dispatch"}</button>`;
      } else if (o.fulfilment === "pickup") {
        actions += `<button data-collection="${esc(o.reference)}">Confirm customer collected</button>`;
      } else if (remaining > 0) {
        actions += o.plant
          ? `<button data-assign="${esc(o.reference)}">Assign remaining items to rider</button>`
          : `<p>Confirm the production location in Kitchen before assigning a rider.</p>`;
      }
      return `<section class="panel workflow-card" data-state="${esc(o.status)}" data-work="${esc(o.reference)}">${pill(o.status, true)} ${o.payment_test && !o.review_checkout ? pill("SIMULATED TEST") : ""}<h2>${esc(o.reference)}</h2><p>${esc(date(o.created_at))} / ${esc(o.fulfilment)} / ${esc(o.plant || "Production unassigned")}</p>${o.items.map((l) => `<h3>${esc(l.quantity)} × ${esc(l.name)}</h3><p>${esc(l.selection?.size || "")} ${(l.selection?.variation_attributes || []).map((a) => `${esc(a.attribute)}: ${esc(a.value)}`).join(" / ")}</p><p>${esc(l.selection?.message || "")}</p>`).join("")}<div class="workflow-actions">${canOperate() ? `<button data-order-details="${esc(o.reference)}">Customer details & tracking</button>` : ""}${actions}</div></section>`;
    })
    .join("");
  const next = {
    assigned: ["accepted", "Accept assignment"],
    rescheduled: ["accepted", "Accept rescheduled trip"],
    accepted: ["collected", "Confirm kitchen handover"],
    collected: ["in_transit", "Mark on the way"],
    in_transit: ["delivered", "Confirm delivery"],
  };
  const tripCards = tasks
    .filter((t) => t.status !== "cancelled")
    .map((t) => {
      const action = next[t.status];
      const feedback = t.feedback;
      const quality =
        t.status === "delivered"
          ? `<div class="ride-quality">${feedback ? `<span class="pill ${feedback.timing === "on_time" ? "good" : feedback.timing === "late" ? "warning" : ""}">${feedback.timing === "on_time" ? "Arrived on time" : feedback.timing === "late" ? "Arrived late" : "Arrival time not confirmed"}</span><span class="pill ${feedback.condition === "good" ? "good" : "issue"}">${feedback.condition === "good" ? "Received in good condition" : feedback.condition === "damaged" ? "Damage reported" : "Condition issue reported"}</span><strong>${feedback.rating} / 5 stars</strong>${feedback.comment ? `<p>${esc(feedback.comment)}</p>` : ""}<small>Customer-reported arrival and condition.</small>` : `<span class="pill">Awaiting customer feedback</span><small>Ride not yet rated.</small>`}</div>`
          : "";
      const button = (status, label) =>
        `<button data-trip="${esc(t.id)}" data-revision="${t.revision}" data-status="${status}">${label}</button>`;
      return `<section class="panel workflow-card trip-card" data-state="${esc(t.status)}" data-trip-card="${esc(t.id)}">${pill(t.status, t.status === "delivered")}<h2>${esc(t.reference)}</h2><p>${esc(t.rider_name)} / ${esc(t.destination)}</p><p>${esc(t.recipient)} / ${esc(t.phone)}</p>${quality}<div class="workflow-actions">${action ? button(...action) : ""}${t.status === "delivered" ? "" : t.status === "failed" ? button("rescheduled", "Retry delivery") : button("failed", "Report delivery issue")}${["assigned", "accepted", "rescheduled", "failed"].includes(t.status) ? button("cancelled", "Cancel trip") : ""}</div></section>`;
    })
    .join("");
  const stages = kitchen
    ? [
        ["paid", "Awaiting preparation"],
        ["preparing", "In the kitchen"],
        ["ready", "Kitchen complete"],
      ]
    : [
        ["ready", "Ready for handover"],
        ["out_for_delivery", "On the road"],
      ];
  const pulse = `<div class="queue-pulse">${stages.map(([status, label], i) => `<div><span class="queue-step">0${i + 1}</span><strong>${rows.filter((o) => o.status === status).length}</strong><span>${label}</span></div>`).join("")}${!kitchen ? `<div><span class="queue-step">LIVE</span><strong>${tasks.filter((t) => !["delivered", "cancelled"].includes(t.status)).length}</strong><span>Active rider trips</span></div>` : ""}</div>`;
  return `<section class="queue-heading"><div><span class="eyebrow">${kitchen ? "CRAFT & CARE" : "THE LAST MILE"}</span><h2>${kitchen ? "Every cake, made with care." : "Great moments. Delivered."}</h2><p>${rows.length} orders in this queue, ready for the next step.</p></div><button class="primary" data-action="retry">Refresh queue</button></section>${pulse}<p>Assignments reach the rider's login. Customer tracking and notifications update as the kitchen and rider progress.</p><div class="cards">${cards || empty("Queue is clear", "Orders appear here when they reach this stage.")}</div>${!kitchen ? `<h2>Rider trips & delivery quality</h2><div class="cards">${tripCards || empty("No active trips", "Assign a provisioned rider to begin dispatch.")}</div>` : ""}`;
}
const views = {
  async kitchen() {
    return workflowBoard("kitchen");
  },
  async dispatch() {
    return workflowBoard("dispatch");
  },
  async payments() {
    const orders = await request("/v1/admin/app-orders");
    return table(
      ["Reference", "Kind", "Total", "State", ""],
      orders.map(
        (o) =>
          `<tr><td>${esc(o.reference)}</td><td>${o.payment_test && !o.review_checkout ? pill("SIMULATED - NO CHARGE") : esc(o.environment)}</td><td>${money(o.total_minor)}</td><td>${pill(o.payment_state, o.payment_state === "completed")}</td><td><button data-order-details="${esc(o.reference)}">View details</button></td></tr>`,
      ),
    );
  },
  async club() {
    const rows = await request("/v1/admin/dashboard/club");
    return table(
      ["Customer", "Points", "Qualifying spend", "Purchases", "Review"],
      rows.map(
        (c) =>
          `<tr><td>${esc(c.name)}<small>${esc(c.email)}</small></td><td>${c.points}</td><td>${money(c.spend_minor)}</td><td>${c.purchases}</td><td>${c.review_required ? pill("Review required") : "Clear"}</td></tr>`,
      ),
    );
  },
  async delivery() {
    [deliverySettings, checkoutSettings] = await Promise.all([
      request("/v1/admin/app-delivery"),
      request("/v1/admin/app-policy"),
    ]);
    const d = deliverySettings,
      p = checkoutSettings || {};
    return `<section class="panel"><h2>App payments and HQ fulfilment</h2><p>All app orders are produced and dispatched from HQ. Confirm the HQ pin, delivery boundary and price/tax treatment before accepting payments.</p><div class="stats">${stat("Route service", d.maps_ready ? "Configured" : "Key needed", "GOOGLE_MAPS_API_KEY on Render")}${stat("Map picker", d.map_picker_ready ? "Configured" : "Key needed", "GOOGLE_MAPS_BROWSER_KEY on Render")}${stat("Checkout", p.enabled && p.pricing_confirmed ? "Enabled" : "Awaiting confirmation", "Live payment also requires the Pesapal merchant account")}</div><button data-payment-check="true">Check Pesapal account and callback setup</button><h3>Confirmed rate card</h3><p>Doorstep: KES 100 + KES 30/km by road from HQ. Same-store HQ collection: free. Transfers to another pickup store: 50% of the applicable delivery fee.</p><small>${esc(d.source)}</small><h3>${esc(d.origin_name)}</h3><p>${esc(d.origin_address)}</p><p>${d.origin ? `${esc(d.origin.latitude)}, ${esc(d.origin.longitude)}` : "HQ pin not confirmed"}. Boundary: ${d.radius_km ? `${esc(d.radius_km)} km radius` : "not confirmed"}.</p><button data-delivery-config="hq">Configure HQ and delivery area</button><button data-checkout-config="true">Configure checkout and tax</button><h3>Additional pickup stores</h3><p>HQ collection is free. Additional stores require a quoted transfer from HQ.</p>${(d.pickup_stores || []).map((s) => `<p>${esc(s.name)} - ${esc(s.address)} <button data-edit-pickup="${esc(s.id)}">Edit branch</button><button data-remove-pickup="${esc(s.id)}">Remove store</button></p>`).join("")}<button data-delivery-config="store">Add pickup store</button></section>`;
  },
  async overview() {
    return workspaceOverview();
  },
  async products() {
    const result = await request(
      `/v1/admin/dashboard/products?page=${page}&search=${encodeURIComponent(search)}&state=${state}`,
    );
    products = result.items;
    return `<form id="search-form" class="toolbar"><input name="search" aria-label="Search products" placeholder="Search name, slug or product ID…" value="${esc(search)}"><select name="state" aria-label="Product status">${["all", "enabled", "disabled", "variations"].map((s) => `<option value="${s}" ${state === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select><button>Search</button></form>${
      products.length
        ? table(
            [
              "Product",
              "App price",
              "Ordering",
              "Stock activity",
              "Status",
              "",
            ],
            products.map((p) => {
              let image = p.payload.images?.[0]?.src || "";
              if (/cakecity\.co\.ke|i[012]\.wp\.com/.test(image))
                image = "/v1/app-media/source?url=" + encodeURIComponent(image);
              return `<tr><td><div class="product-name">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : '<span class="image-fallback">◇</span>'}<div><strong>${esc(p.payload.name)}</strong><small>#${p.id} · ${esc(p.parent_id ? `Variation of #${p.parent_id}` : p.payload.type || "simple")}</small></div></div></td><td>${money(p.price_minor)}</td><td>${p.order_mode === "made_to_order" ? "Made to order" : p.allocation - p.reserved - p.sold}</td><td>${p.order_mode === "made_to_order" ? "See order history" : `${p.reserved} / ${p.sold}`}</td><td>${pill(p.enabled ? "Enabled" : "Disabled", p.enabled)}</td><td><button data-product="${p.id}">Edit product</button></td></tr>`;
            }),
          )
        : empty(
            "No products found",
            "Try a different search or add your first product.",
          )
    }<div class="pagination"><span>${result.total} records · Page ${page} of ${result.pages}</span><button data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>←</button><button data-page="${page + 1}" ${page >= result.pages ? "disabled" : ""}>→</button></div>`;
  },
  async campaigns() {
    campaigns = (await request("/v1/admin/content")).filter(
      (c) => c.kind === "campaign",
    );
    return campaigns.length
      ? `<div class="cards">${campaigns
          .map((c) => {
            const status = !c.published
              ? "Draft"
              : Date.parse(c.starts_at) > Date.now()
                ? "Scheduled"
                : Date.parse(c.ends_at) <= Date.now()
                  ? "Ended"
                  : "Live";
            return `<article class="campaign"><img src="${esc(c.image_url)}" alt="" loading="lazy"><div class="body">${pill(status, status === "Live")}<h2>${esc(c.title)}</h2><p>${esc(c.description)}</p><p>${esc(date(c.starts_at))}<br>to ${esc(date(c.ends_at))}</p><small>${esc(c.product_slugs.join(", ") || `Category #${c.category_id}`)}</small><button data-campaign="${esc(c.id)}">${canWrite() ? "Edit campaign" : "View campaign"}</button></div></article>`;
          })
          .join("")}</div>`
      : empty(
          "Your next campaign starts here",
          "Add artwork, link products and choose when your story goes live.",
        );
  },
  async promotions() {
    promotions = await request("/v1/admin/dashboard/promotions");
    const rows = promotions.filter((c) => !c.customer_id);
    return `<section class="panel"><h2>App checkout discount codes</h2><p>Fixed KES discounts on the cart subtotal. One code per order; delivery is calculated separately. Codes have minimum spend, expiry and total redemption limits. Member reward coupons are protected and remain separate.</p></section>${
      rows.length
        ? table(
            [
              "Code",
              "Discount",
              "Minimum spend",
              "Redeemed / reserved",
              "Expiry",
              "Status",
              "",
            ],
            rows.map(
              (c) =>
                `<tr><td><strong>${esc(c.code.toUpperCase())}</strong></td><td>${money(c.amount_minor)}</td><td>${money(c.minimum_minor)}</td><td>${c.uses} / ${c.reserved} of ${c.usage_limit}</td><td>${esc(date(c.expires_at))}</td><td>${pill(!c.enabled ? "Disabled" : c.expires_at && Date.parse(c.expires_at) <= Date.now() ? "Expired" : c.uses + c.reserved >= c.usage_limit ? "Exhausted" : "Available", c.enabled && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && c.uses + c.reserved < c.usage_limit)}</td><td><button data-promotion="${esc(c.code)}">Edit promotion</button></td></tr>`,
            ),
          )
        : empty(
            "No general promotions yet",
            "Create a code and share it in your app campaign.",
          )
    }`;
  },
  async orders() {
    const rows = await request("/v1/admin/app-orders");
    return (
      `<button data-action="retry">Refresh orders</button><p>Latest 200 app orders. Open an order for its customer details and selected variations.</p>` +
      (rows.length
        ? table(
            ["App order", "Total", "Payment", "Fulfilment", ""],
            rows.map((o) => {
              return `<tr><td><strong>${esc(o.reference)}</strong>${o.payment_test && !o.review_checkout ? pill("SIMULATED TEST") : ""}<button data-order-details="${esc(o.reference)}">View details and tracking</button><small>${esc(date(o.created_at))}</small></td><td>${money(o.total_minor)}</td><td>${pill(o.payment_state, o.payment_state === "completed")}</td><td>${pill(o.status)}</td><td>${orderActions(o)}</td></tr>`;
            }),
          )
        : empty(
            "No app orders yet",
            "Orders will appear here when customers check out in the app.",
          ))
    );
  },
  async sales() {
    const data = await request("/v1/admin/channel-sales");
    return `<div class="stats">${["app", "website"]
      .map((channel) => {
        const c = data.channels.find((x) => x.channel === channel);
        return stat(
          `${channel === "app" ? "App" : "Website"} net sales`,
          money(c?.net_minor),
          `${c?.orders || 0} recorded live orders`,
        );
      })
      .join(
        "",
      )}</div><section class="panel"><h2>Verified channel totals</h2><p>${esc(data.website_reporting)}</p>${table(
      ["Channel", "Orders", "Gross paid", "Reversed", "Net"],
      data.channels.map(
        (c) =>
          `<tr><td>${esc(c.channel)}</td><td>${c.orders}</td><td>${money(c.gross_minor)}</td><td>${money(c.reversed_minor)}</td><td>${money(c.net_minor)}</td></tr>`,
      ),
    )}</section>`;
  },
  async issues() {
    const rows = await request("/v1/admin/commerce-issues");
    return rows.length
      ? table(
          ["Channel", "Reference", "Issue", "Status", ""],
          rows.map(
            (i) =>
              `<tr><td>${pill(i.channel)}</td><td>${esc(i.reference)}</td><td>${esc(i.kind)}</td><td>${pill(i.status, i.status === "resolved")}</td><td>${canOperate() ? `<button data-issue="${esc(i.id)}" data-status="${i.status === "open" ? "resolved" : "open"}">${i.status === "open" ? "Resolve" : "Reopen"}</button>` : ""}</td></tr>`,
          ),
        )
      : empty(
          "No issues recorded",
          "App and website integration issues will appear with their own channel labels.",
        );
  },
};
function openEditor(title, fields, save, readOnly = false) {
  $("editor-title").textContent = title;
  $("fields").innerHTML = fields;
  $("editor-error").textContent = "";
  $("save").hidden = readOnly;
  $("fields")
    .querySelectorAll("input,textarea,select")
    .forEach((i) => (i.disabled = readOnly));
  editorSave = save;
  $("editor").showModal();
}
function deliveryPayload(overrides = {}) {
  const {
    enabled,
    origin_name,
    origin_address,
    origin,
    radius_km,
    pickup_stores,
  } = deliverySettings;
  return {
    enabled,
    origin_name,
    origin_address,
    origin,
    radius_km,
    pickup_stores,
    ...overrides,
  };
}
function deliveryEditor(kind) {
  const d = deliverySettings;
  if (kind === "hq") {
    openEditor(
      "HQ production and delivery boundary",
      `<div class="form-grid">${input("origin_name", "Production / dispatch name", d.origin_name, "text", "required")}${input("origin_address", "HQ address", d.origin_address, "text", "required")}<button type="button" data-find-hq="true">Find HQ pin from this address</button><div id="hq-results" class="full"></div>${input("latitude", "Confirmed HQ latitude", d.origin?.latitude ?? "", "number", "required min=-90 max=90 step=any")}${input("longitude", "Confirmed HQ longitude", d.origin?.longitude ?? "", "number", "required min=-180 max=180 step=any")}${input("radius_km", "Delivery radius from HQ (km)", d.radius_km ?? "", "number", "required min=0.1 max=500 step=0.1")}${check("enabled", "Enable HQ distance delivery and transfers", d.enabled)}<p class="help full">Select the correct HQ result before saving. The circle controls eligibility; Google road distance determines the delivery charge.</p></div>`,
      async (f) => {
        await request(
          "/v1/admin/app-delivery",
          "PUT",
          deliveryPayload({
            enabled: f.has("enabled"),
            origin_name: f.get("origin_name").trim(),
            origin_address: f.get("origin_address").trim(),
            origin: {
              latitude: Number(f.get("latitude")),
              longitude: Number(f.get("longitude")),
            },
            radius_km: Number(f.get("radius_km")),
          }),
        );
      },
    );
  } else {
    const store = d.pickup_stores.find((s) => s.id === kind);
    openEditor(
      store ? "Edit pickup store" : "Add a pickup store",
      `<div class="form-grid">${input("id", "Store ID", store?.id || "", "text", `required pattern="[a-z0-9-]{1,60}" ${store ? "readonly" : ""}`)}${input("name", "Store name", store?.name || "", "text", "required")}${input("address", "Store address", store?.address || "", "text", "required")}${input("latitude", "Store latitude (optional)", store?.latitude ?? "", "number", "min=-90 max=90 step=any")}${input("longitude", "Store longitude (optional)", store?.longitude ?? "", "number", "min=-180 max=180 step=any")}<p class="help full">The app quotes 50% of the applicable HQ-to-store delivery fee for this transfer. Set the exact branch pin here if its address lookup needs confirmation.</p></div>`,
      async (f) => {
        await request(
          "/v1/admin/app-delivery",
          "PUT",
          deliveryPayload({
            pickup_stores: [
              ...d.pickup_stores.filter((s) => s.id !== store?.id),
              {
                id: f.get("id"),
                name: f.get("name"),
                address: f.get("address"),
                latitude: f.get("latitude") ? Number(f.get("latitude")) : null,
                longitude: f.get("longitude")
                  ? Number(f.get("longitude"))
                  : null,
              },
            ],
          }),
        );
      },
    );
  }
}
function checkoutEditor() {
  const p = checkoutSettings || {};
  openEditor(
    "Checkout activation and price / tax confirmation",
    `<div class="form-grid">${check("enabled", "Enable app checkout", p.enabled)}${check("pricing_confirmed", "I confirm the app prices and tax treatment below", p.pricing_confirmed)}${check("pickup_enabled", "Offer customer pickup", p.pickup_enabled)}${check("prices_include_tax", "Listed prices already include applicable tax", p.prices_include_tax)}${input("tax_bps", "Applicable tax rate in basis points (100 = 1%)", p.tax_bps ?? "", "number", "required min=0 max=10000 step=1")}${area("pickup_instructions", "Customer pickup instructions", p.pickup_instructions || "Collect your app order at Cake City HQ, Soliton Academy, Wambugu Road, after it is marked ready. Present your APP order reference.")}<p class="help full">Use Cake City's approved tax rate. Enabling checkout allows real payment using the configured Pesapal account. This does not issue an eTIMS invoice.</p></div>`,
    async (f) =>
      request("/v1/admin/app-policy", "PUT", {
        enabled: f.has("enabled"),
        pricing_confirmed: f.has("pricing_confirmed"),
        pickup_enabled: f.has("pickup_enabled"),
        prices_include_tax: f.has("prices_include_tax"),
        tax_bps: Number(f.get("tax_bps")),
        pickup_instructions: f.get("pickup_instructions").trim(),
      }),
  );
}
function uploadField() {
  return '<div class="upload full"><label>Upload artwork to the app<input id="upload" type="file" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG or WebP, up to 2 MB. Uploads are saved to the app backend.</small><p id="upload-status" role="status"></p></div>';
}
function productEditor(p) {
  const payload = p?.payload || {};
  openEditor(
    p ? `Edit ${payload.name}` : "Add product",
    `<div class="form-grid">${input("name", "Product name", payload.name || "", "text", "required maxlength=240")}${input("slug", "Product slug", p?.slug || "", "text", 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${input("price", "App price (KES)", (p?.price_minor || 0) / 100, "number", "required min=0.01 step=0.01 max=10000000")}<label>Ordering mode<select name="order_mode"><option value="made_to_order" ${(p?.order_mode || "made_to_order") === "made_to_order" ? "selected" : ""}>Made to order</option><option value="stocked" ${p?.order_mode === "stocked" ? "selected" : ""}>Stocked item</option></select></label>${input("allocation", "Stock quantity (stocked items only)", p?.allocation || 0, "number", `required min=${(p?.reserved || 0) + (p?.sold || 0)} max=1000000 step=1`)}<p class="help full">Made-to-order cakes require no stock quantity. Stocked item allocation includes reserved and sold units. Current reserved: ${p?.reserved || 0}; sold: ${p?.sold || 0}. Disable a product to remove it from app ordering.</p>${input("parent_id", "Parent product ID (variation only)", p?.parent_id || "", "number", "readonly")}${check("enabled", "Enable for app orders", p?.enabled)}${area("short_description", "Short description", payload.short_description)}${area("description", "Full description", payload.description)}${area(
      "images",
      "Image URLs (one per line)",
      (payload.images || [])
        .map((i) => {
          const u = i.src || "";
          return /cakecity\.co\.ke|i[012]\.wp\.com/.test(u)
            ? "/v1/app-media/source?url=" + encodeURIComponent(u)
            : u;
        })
        .join("\n"),
    )}${uploadField()}${area("categories", "Categories: ID | Name | slug (one per line)", (payload.categories || []).map((c) => `${c.id} | ${c.name} | ${c.slug}`).join("\n"))}<p class="help full">Existing variation attributes are preserved. New products are simple products. Existing imported variations can be edited individually.</p></div>`,
    async (f) => {
      const categories = f
        .get("categories")
        .split("\n")
        .filter((x) => x.trim())
        .map((line) => {
          const [id, name, slug] = line.split("|").map((x) => x.trim());
          if (!id || !name || !slug)
            throw Error("Each category needs ID | Name | slug");
          return { id: Number(id), name, slug };
        });
      await request(
        `/v1/admin/dashboard/products${p ? `/${p.id}` : ""}`,
        p ? "PUT" : "POST",
        {
          revision: p?.revision || 0,
          name: f.get("name"),
          slug: f.get("slug"),
          description: f.get("description"),
          short_description: f.get("short_description"),
          price_minor: Math.round(Number(f.get("price")) * 100),
          allocation: Number(f.get("allocation")),
          order_mode: f.get("order_mode"),
          enabled: f.has("enabled"),
          parent_id: f.get("parent_id") ? Number(f.get("parent_id")) : null,
          image_urls: list(f.get("images")),
          categories,
        },
      );
    },
  );

  const mode = $("fields").querySelector('[name="order_mode"]');
  const allocationField = $("fields").querySelector('[name="allocation"]');
  mode.onchange = () => {
    allocationField.closest("label").hidden = mode.value === "made_to_order";
  };
  mode.onchange();
}
function campaignEditor(c) {
  const now = new Date();
  openEditor(
    c ? `Campaign · ${c.title}` : "New campaign",
    `<div class="form-grid">${input("title", "Campaign title", c?.title || "", "text", "required minlength=3 maxlength=100")}${input("template", "Template", c?.template || "spotlight", "text", 'required pattern="spotlight|celebration|offer"')}${area("description", "Campaign description", c?.description || "")}${input("starts_at", "Starts (your local time)", localTime(c?.starts_at || now), "datetime-local", "required")}${input("ends_at", "Ends (your local time)", localTime(c?.ends_at || new Date(now.getTime() + 7 * 86400000)), "datetime-local", "required")}${area("image_url", "Artwork URL", c?.image_url || "")}${uploadField()}${input("video_url", "Optional video URL", c?.video_url || "")}${input("category_id", "Category ID (or link products below)", c?.category_id || "", "number", "min=1")}${area("product_slugs", "Linked product slugs (comma separated, up to 8)", c?.product_slugs?.join(", ") || "")}${area("branch_names", "Branches (comma separated, leave blank for all)", c?.branch_names?.join(", ") || "")}${check("member_only", "Members only", c?.member_only)}${check("published", "Publish on schedule", c?.published)}<p class="help full">For an offer, create its code under Promotions and include that code in the campaign description. Campaigns do not change checkout prices automatically.</p></div>`,
    async (f) => {
      await request(
        `/v1/admin/content/campaigns${c ? `/${c.id}` : ""}`,
        c ? "PUT" : "POST",
        {
          revision: c?.revision || 0,
          title: f.get("title"),
          description: f.get("description"),
          image_url: f.get("image_url").trim(),
          video_url: f.get("video_url").trim(),
          starts_at: new Date(f.get("starts_at")).toISOString(),
          ends_at: new Date(f.get("ends_at")).toISOString(),
          product_slugs: list(f.get("product_slugs")),
          category_id: f.get("category_id")
            ? Number(f.get("category_id"))
            : null,
          branch_names: list(f.get("branch_names")),
          member_only: f.has("member_only"),
          published: f.has("published"),
          template: f.get("template"),
        },
      );
    },
    !canWrite(),
  );
}
function promotionEditor(c) {
  openEditor(
    c ? `Promotion · ${c.code.toUpperCase()}` : "New promotion",
    `<div class="form-grid">${input("code", "Promotion code", c?.code || "", "text", `required minlength=3 maxlength=80 pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}" ${c ? "readonly" : ""}`)}${input("amount", "Discount amount (KES)", (c?.amount_minor || 0) / 100, "number", "required min=0.01 step=0.01 max=10000000")}${input("minimum", "Minimum cart subtotal (KES)", (c?.minimum_minor || 0) / 100, "number", "required min=0 step=0.01 max=10000000")}${input("usage_limit", "Total redemption limit", c?.usage_limit || 100, "number", `required min=${Math.max(1, (c?.uses || 0) + (c?.reserved || 0))} max=1000000 step=1`)}${input("expires_at", "Expiry (your local time, optional)", c?.expires_at ? localTime(c.expires_at) : "", "datetime-local")}${check("enabled", "Enable this code", c?.enabled ?? true)}<p class="help full">Discounts apply to the cart subtotal and cannot exceed it. Redeemed and reserved uses are preserved. Disable a code to stop new orders from using it.</p></div>`,
    async (f) => {
      await request(
        `/v1/admin/dashboard/promotions/${encodeURIComponent(f.get("code").trim())}`,
        "PUT",
        {
          version: c?.version || "",
          amount_minor: Math.round(Number(f.get("amount")) * 100),
          minimum_minor: Math.round(Number(f.get("minimum")) * 100),
          usage_limit: Number(f.get("usage_limit")),
          enabled: f.has("enabled"),
          expires_at: f.get("expires_at")
            ? new Date(f.get("expires_at")).toISOString()
            : null,
        },
      );
    },
  );
}
$("create").onclick = () =>
  ({
    products: productEditor,
    campaigns: campaignEditor,
    promotions: promotionEditor,
  })[tab]?.();
$("close-editor").onclick = $("cancel").onclick = () => $("editor").close();
$("edit-form").onsubmit = async (e) => {
  e.preventDefault();
  $("save").disabled = true;
  $("editor-error").textContent = "";
  try {
    await editorSave(new FormData(e.target));
    $("editor").close();
    await show();
    notice("Changes saved to the app.");
  } catch (error) {
    $("editor-error").textContent = error.message;
  } finally {
    $("save").disabled = false;
  }
};
document.addEventListener("change", async (e) => {
  if (e.target.id !== "upload") return;
  const file = e.target.files[0];
  if (!file) return;
  $("upload-status").textContent = "Uploading…";
  $("save").disabled = true;
  try {
    if (
      file.size > 2000000 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw Error("Use a JPG, PNG or WebP under 2 MB.");
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await request("/v1/admin/content/assets", "POST", {
      mime: file.type,
      data: base64,
    });
    const target = $("fields").querySelector(
      '[name="images"], [name="image_url"]',
    );
    target.value =
      target.name === "images"
        ? [target.value, result.url].filter(Boolean).join("\n")
        : result.url;
    $("upload-status").textContent =
      "Uploaded. Save the form to apply this artwork.";
  } catch (error) {
    $("upload-status").textContent = error.message;
  } finally {
    $("save").disabled = false;
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "search-form") return;
  e.preventDefault();
  const f = new FormData(e.target);
  search = f.get("search").trim();
  state = f.get("state");
  page = 1;
  show();
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.nav) {
    await show(d.nav);
    return;
  }
  if (d.page) {
    page = Number(d.page);
    await show();
  }
  if (d.product)
    productEditor(products.find((p) => p.id === Number(d.product)));
  if (d.campaign) campaignEditor(campaigns.find((c) => c.id === d.campaign));
  if (d.promotion)
    promotionEditor(promotions.find((c) => c.code === d.promotion));
  if (d.action === "retry") await show();
  if (d.paymentCheck) {
    b.disabled = true;
    try {
      const result = await request(
        "/v1/admin/app-delivery/payment-check",
        "POST",
        {},
      );
      notice(
        `Pesapal ${result.environment} account connected; payment notifications registered. No money charged.`,
      );
    } catch (error) {
      notice(error.message, true);
    } finally {
      b.disabled = false;
    }
  }
  if (d.deliveryConfig) deliveryEditor(d.deliveryConfig);
  if (d.editPickup) deliveryEditor(d.editPickup);
  if (d.checkoutConfig) checkoutEditor();
  if (d.findHq) {
    b.disabled = true;
    try {
      const address = $("fields").querySelector(
        '[name="origin_address"]',
      ).value;
      const data = await request("/v1/app-delivery/search", "POST", {
        address,
      });
      $("hq-results").innerHTML =
        data.results
          .map(
            (r) =>
              `<button type="button" data-hq-lat="${esc(r.latitude)}" data-hq-lng="${esc(r.longitude)}">${esc(r.address)}</button>`,
          )
          .join("") ||
        "No matching HQ address found. Check the address and try again.";
    } catch (error) {
      $("editor-error").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  }
  if (d.hqLat) {
    $("fields").querySelector('[name="latitude"]').value = d.hqLat;
    $("fields").querySelector('[name="longitude"]').value = d.hqLng;
    $("hq-results").textContent =
      "HQ pin selected. Confirm this is the correct production location before saving.";
  }
  if (d.removePickup) {
    try {
      await request(
        "/v1/admin/app-delivery",
        "PUT",
        deliveryPayload({
          pickup_stores: deliverySettings.pickup_stores.filter(
            (s) => s.id !== d.removePickup,
          ),
        }),
      );
      await show();
    } catch (error) {
      notice(error.message, true);
    }
  }
  if (d.orderDetails) {
    try {
      const o = await request(
        `/v1/admin/app-orders/${encodeURIComponent(d.orderDetails)}`,
      );
      const entries = (obj) =>
        Object.entries(obj)
          .map(
            ([key, value]) =>
              `<p><strong>${esc(key.replaceAll("_", " "))}:</strong> ${value !== null && typeof value === "object" ? `<div class="panel">${entries(value)}</div>` : esc(value)}</p>`,
          )
          .join("");
      openEditor(
        o.reference,
        `<div class="full"><h3>${esc(o.status.replaceAll("_", " "))} - ${money(o.total_minor)}</h3><p>Payment: ${esc(o.payment_state)} / ${o.review_checkout ? "KES 0 collected" : o.payment_test ? "SIMULATED TEST - NO MONEY CHARGED" : esc(o.environment)}</p>${o.dispatch ? `<h3>Assigned rider</h3>${entries(o.dispatch)}` : ""}<h3>Customer and fulfilment</h3>${entries(o.snapshot?.checkout || {})}<h3>Products and variations</h3>${(o.snapshot?.lines || []).map((l) => `<section class="panel"><strong>${esc(l.quantity)} x ${esc(l.name)}</strong><p>Product ${esc(l.product_id)} / SKU ${esc(l.sku_id)} / ${money(l.line_minor)}</p>${entries(l.selection || {})}</section>`).join("")}<h3>Delivery route and charge</h3>${entries(o.snapshot?.route || {})}<h3>Customer receipt</h3><p>${o.received_at ? `Confirmed ${esc(date(o.received_at))}` : "Awaiting customer acknowledgement"}</p><h3>Tracking history</h3><p>Order placed / ${esc(date(o.created_at))}</p>${(o.events || []).map((e) => `<p>${esc(e.kind.replaceAll("_", " "))} / ${esc(date(e.created_at))}</p>`).join("")}</div>`,
        null,
        true,
      );
    } catch (error) {
      notice(error.message, true);
    }
  }
  if (d.kitchenAssign || d.assign) {
    b.disabled = true;
    try {
      const kitchen = !!d.kitchenAssign;
      const choices = await request(
        kitchen ? "/v1/kitchen/locations" : "/v1/logistics/riders",
      );
      if (!choices.length)
        throw Error(
          kitchen
            ? "No production locations are assigned to your account."
            : "No rider accounts are available. Ask your administrator to provision a rider login first.",
        );
      openEditor(
        kitchen ? "Assign production" : "Assign delivery rider",
        `<label>${kitchen ? "Production location" : "Rider account"}<select required name="selection">${choices.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label><p>${kitchen ? "Assign this order to your kitchen login at the selected location." : "The task will appear in this rider's login. The delivery address comes from checkout."}</p>`,
        (f) =>
          request(
            kitchen
              ? `/v1/kitchen/orders/${encodeURIComponent(d.kitchenAssign)}/assignment`
              : `/v1/logistics/orders/${encodeURIComponent(d.assign)}/tasks`,
            kitchen ? "PUT" : "POST",
            kitchen
              ? { plant: f.get("selection"), assigned_to: session.customer.id }
              : { rider_id: f.get("selection") },
          ),
      );
    } catch (error) {
      notice(error.message, true);
    } finally {
      b.disabled = false;
    }
    return;
  }
  if (
    d.trip &&
    ["delivered", "failed", "rescheduled", "cancelled"].includes(d.status)
  ) {
    const delivered = d.status === "delivered";
    openEditor(
      delivered ? "Confirm delivery" : "Dispatch update",
      input(
        delivered ? "proof" : "note",
        delivered ? "Delivery confirmation" : "Reason for update",
        "",
        "text",
        `required minlength="${delivered ? 3 : 5}" maxlength="500"`,
      ),
      (f) =>
        request(`/v1/logistics/tasks/${encodeURIComponent(d.trip)}`, "PATCH", {
          revision: Number(d.revision),
          status: d.status,
          [delivered ? "proof" : "note"]: f.get(delivered ? "proof" : "note"),
        }),
    );
    return;
  }
  if (d.kitchenOrder || d.collection || d.trip) {
    b.disabled = true;
    try {
      await request(
        d.kitchenOrder
          ? `/v1/kitchen/orders/${encodeURIComponent(d.kitchenOrder)}/status`
          : d.collection
            ? `/v1/logistics/orders/${encodeURIComponent(d.collection)}/collection`
            : `/v1/logistics/tasks/${encodeURIComponent(d.trip)}`,
        d.collection ? "POST" : "PATCH",
        d.collection
          ? {}
          : {
              status: d.status,
              ...(d.trip ? { revision: Number(d.revision) } : {}),
            },
      );
      await show();
      notice("Order progress updated.");
    } catch (error) {
      notice(error.message, true);
      b.disabled = false;
    }
    return;
  }
  if (d.order || d.issue) {
    b.disabled = true;
    try {
      await request(
        d.order
          ? `/v1/admin/app-orders/${encodeURIComponent(d.order)}`
          : `/v1/admin/commerce-issues/${encodeURIComponent(d.issue)}`,
        "PATCH",
        { status: d.status },
      );
      await show();
      notice("Status updated.");
    } catch (error) {
      notice(error.message, true);
      b.disabled = false;
    }
  }
});
