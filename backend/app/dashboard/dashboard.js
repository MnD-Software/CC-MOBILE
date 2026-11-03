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
let session = null,
  refreshPromise = null,
  tab = "overview",
  page = 1,
  search = "",
  state = "all",
  products = [],
  campaigns = [],
  promotions = [],
  editorSave = null,
  generation = 0;
const operatorRoles = ["admin", "staff", "ecommerce_manager"],
  writerRoles = [...operatorRoles, "marketing_manager", "content_manager"],
  readerRoles = [...writerRoles, "executive", "analyst"],
  reportRoles = [...operatorRoles, "executive", "finance", "analyst"];
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
    if (!readerRoles.includes(session.customer.role) && !canReport()) {
      await request("/v1/auth/mobile/logout", "POST", {
        refresh_token: session.refresh_token,
      });
      session = null;
      throw Error(
        "This account does not have dashboard access. Ask your administrator to assign a staff role.",
      );
    }
    $("signin").reset();
    $("login").hidden = true;
    $("workspace").hidden = false;
    $("identity").textContent =
      `${session.customer.first_name} · ${session.customer.role.replaceAll("_", " ")}`;
    navigation();
    await show("overview");
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
  overview: ["◈", "Overview", "A clear view of your app store."],
  products: [
    "▦",
    "Products",
    "Edit your catalogue, app prices and available production capacity.",
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
  const allowed = [
    "overview",
    ...(canOperate() ? ["products"] : []),
    ...(readerRoles.includes(session.customer.role) ? ["campaigns"] : []),
    ...(canOperate() ? ["promotions", "orders"] : []),
    ...(canReport() ? ["sales", "issues"] : []),
  ];
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
async function show(next = tab) {
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
const views = {
  async overview() {
    const results = await Promise.all([
      canOperate() ? request("/v1/admin/dashboard/products?per_page=1") : null,
      readerRoles.includes(session.customer.role)
        ? request("/v1/admin/content")
        : null,
      canOperate() ? request("/v1/admin/dashboard/promotions") : null,
      canReport() ? request("/v1/admin/channel-sales") : null,
    ]);
    const [catalogue, content, codes, sales] = results;
    const live = (content || []).filter(
      (c) =>
        c.kind === "campaign" &&
        c.published &&
        Date.parse(c.starts_at) <= Date.now() &&
        Date.parse(c.ends_at) > Date.now(),
    );
    const app = (sales?.channels || []).find((c) => c.channel === "app");
    return `<div class="stats">${catalogue ? stat("Catalogue records", catalogue.total, "Includes products and variations") : ""}${content ? stat("Live campaigns", live.length, "Published and within schedule") : ""}${codes ? stat("Available promotion codes", codes.filter((c) => !c.customer_id && c.enabled && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && c.uses + c.reserved < c.usage_limit).length, "General app discount codes") : ""}${sales ? stat("App net sales", money(app?.net_minor), "Verified live payments") : ""}</div><div class="split"><section class="panel"><h2>Your app, ready for the next occasion</h2><p>Keep your range current, tell your story and give customers a reason to celebrate.</p>${canOperate() ? `<div class="action-row"><div><strong>Manage your range</strong><p>Products, variations, images, prices and app stock.</p></div><button data-nav="products">Open catalogue →</button></div>` : ""}${readerRoles.includes(session.customer.role) ? `<div class="action-row"><div><strong>Plan your next campaign</strong><p>Artwork, linked cakes, schedules and publishing.</p></div><button data-nav="campaigns">View campaigns →</button></div>` : ""}${canOperate() ? `<div class="action-row"><div><strong>Create an app promotion</strong><p>Discount value, minimum spend and redemption limits.</p></div><button data-nav="promotions">Manage codes →</button></div>` : ""}</section><section class="panel"><span class="eyebrow">INDEPENDENT COMMERCE</span><h2>One brand. Clear accountability.</h2><p>This workspace manages the app’s own catalogue, campaigns and checkout discounts. Changes persist in the app backend.</p><div class="action-row"><div><strong>App order references</strong><p>APP-prefixed orders stay traceable to the app.</p></div>${pill("App channel", true)}</div><div class="action-row"><div><strong>Website reporting</strong><p>Website totals appear only when imported by the separate reporting integration.</p></div></div><small>Campaign stories promote an offer. Create its discount code under Promotions so checkout can apply it.</small></section></div>`;
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
              "Available",
              "Reserved / sold",
              "Status",
              "",
            ],
            products.map((p) => {
              let image = p.payload.images?.[0]?.src || "";
              if (/cakecity\.co\.ke|i[012]\.wp\.com/.test(image))
                image = "/v1/app-media/source?url=" + encodeURIComponent(image);
              return `<tr><td><div class="product-name">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : '<span class="image-fallback">◇</span>'}<div><strong>${esc(p.payload.name)}</strong><small>#${p.id} · ${esc(p.parent_id ? `Variation of #${p.parent_id}` : p.payload.type || "simple")}</small></div></div></td><td>${money(p.price_minor)}</td><td>${p.allocation - p.reserved - p.sold}</td><td>${p.reserved} / ${p.sold}</td><td>${pill(p.enabled ? "Enabled" : "Disabled", p.enabled)}</td><td><button data-product="${p.id}">Edit product</button></td></tr>`;
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
    return rows.length
      ? table(
          ["App order", "Total", "Payment", "Fulfilment", ""],
          rows.map((o) => {
            const next =
              {
                paid: ["preparing"],
                preparing: ["ready"],
                ready: ["out_for_delivery", "completed"],
                out_for_delivery: ["completed"],
              }[o.status] || [];
            return `<tr><td><strong>${esc(o.reference)}</strong><small>${esc(date(o.created_at))}</small></td><td>${money(o.total_minor)}</td><td>${pill(o.payment_state, o.payment_state === "completed")}</td><td>${pill(o.status)}</td><td>${o.payment_state === "completed" ? next.map((s) => `<button data-order="${esc(o.reference)}" data-status="${s}">Mark ${s.replaceAll("_", " ")}</button>`).join(" ") : "Awaiting verified payment"}</td></tr>`;
          }),
        )
      : empty(
          "No app orders yet",
          "Orders will appear here when customers check out in the app.",
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
function uploadField() {
  return '<div class="upload full"><label>Upload artwork to the app<input id="upload" type="file" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG or WebP, up to 2 MB. Uploads are saved to the app backend.</small><p id="upload-status" role="status"></p></div>';
}
function productEditor(p) {
  const payload = p?.payload || {};
  openEditor(
    p ? `Edit ${payload.name}` : "Add product",
    `<div class="form-grid">${input("name", "Product name", payload.name || "", "text", "required maxlength=240")}${input("slug", "Product slug", p?.slug || "", "text", 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${input("price", "App price (KES)", (p?.price_minor || 0) / 100, "number", "required min=0.01 step=0.01 max=10000000")}${input("allocation", "Total app allocation", p?.allocation || 0, "number", `required min=${(p?.reserved || 0) + (p?.sold || 0)} max=1000000 step=1`)}<p class="help full">Allocation includes reserved and sold units. Current reserved: ${p?.reserved || 0}; sold: ${p?.sold || 0}. Disable a product to remove it from app ordering.</p>${input("parent_id", "Parent product ID (variation only)", p?.parent_id || "", "number", "readonly")}${check("enabled", "Enable for app orders", p?.enabled)}${area("short_description", "Short description", payload.short_description)}${area("description", "Full description", payload.description)}${area(
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
          enabled: f.has("enabled"),
          parent_id: f.get("parent_id") ? Number(f.get("parent_id")) : null,
          image_urls: list(f.get("images")),
          categories,
        },
      );
    },
  );
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
