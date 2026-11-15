// Small operational tools extend the existing workspace and preserve its queues.
const journeyManagers = ["admin", "staff", "ecommerce_manager"];
const journeyDesignRoles = [
  ...journeyManagers,
  "production",
  "head_chef",
  "call_center_manager",
  "call_center_agent",
  "customer_service",
];
const journeyFactsRoles = [...journeyManagers, "head_chef", "content_manager"];
const journeyMarketingRoles = [
  ...journeyManagers,
  "marketing_manager",
  "content_manager",
];
const experienceBeforeJourney = views.experience;
views.experience = async () => {
  let html = await experienceBeforeJourney();
  const role = session.customer.role;
  if (journeyDesignRoles.includes(role))
    html += `<section class="panel"><h2>Design approval</h2><p>Send a versioned design to the client. The kitchen waits for approval before preparing it.</p><form data-design-form>${input("reference", "Order reference", "", "text", 'required placeholder="APP-…"')}<div class="ecosystem-actions"><button type="button" data-design-load>Open current design</button></div><input name="revision" type="hidden" value="0"><p data-design-state></p>${area("description", "Colours, finish and inscription for approval", "")}<label>Design photo · PNG/JPEG, up to 2 MB<input name="photo" type="file" accept="image/png,image/jpeg"></label><img data-design-photo alt="Current cake design" hidden style="max-height:220px;max-width:100%;border-radius:18px"><button type="submit" class="primary">Publish for customer approval</button></form></section>`;
  if (journeyFactsRoles.includes(role))
    html += `<section class="panel"><h2>Verified ingredients & product care</h2><p>Publish only approved recipe information. Customers see ingredients, allergens and handling advice.</p><form data-facts-form>${input("identity", "Catalogue product ID", "", "number", 'required min="1"')}<button type="button" data-facts-load>Open product information</button><input name="revision" type="hidden" value="0">${area("ingredients", "Ingredients", "")}${input("contains", "Contains allergens · comma separated", "")}${input("may_contain", "May contain allergens · comma separated", "")}${input("dietary", "Verified dietary labels · comma separated", "")}${area("handling", "Storage and serving care", "")}${input("source", "Internal approved recipe reference", "")}${check("published", "Publish verified information", false)}<button type="submit" class="primary">Save product information</button></form></section>`;
  if (journeyMarketingRoles.includes(role)) {
    const funnel = await request("/v1/journey/staff/funnel"),
      local = await request("/v1/journey/staff/funnel?environment=development");
    html += `<section class="panel"><h2>App journey & loading</h2><p>${esc(funnel.definition)}</p>${[
      funnel,
      local,
    ]
      .map(
        (f) =>
          `<details ${f.environment === "live" ? "open" : ""}><summary>${f.environment === "live" ? "Live app" : "Local review"} · last 30 days</summary>${table(
            ["Step", "Clients", "Events"],
            f.items.map(
              (i) =>
                `<tr><td>${esc(i.name.replaceAll("_", " "))}</td><td>${i.customers}</td><td>${i.events}</td></tr>`,
            ),
          )}<p>Image load · median ${f.image_p50_ms ?? "—"} ms · 95th percentile ${f.image_p95_ms ?? "—"} ms</p></details>`,
      )
      .join("")}</section>`;
  }
  return html;
};
const corporateBeforePurchasing = views.corporate;
views.corporate = async () => {
  let html = await corporateBeforePurchasing();
  if (!businessCompany) return html;
  const p = await request(
    `/v1/business/companies/${businessCompany}/purchasing`,
  );
  html += `<section class="panel"><h2>Purchasing & approvals</h2><p>Purchasers prepare quotes. Approvers accept within their limit. Company owners retain final approval.</p>${p.members.map((m) => `<article class="panel"><h3>${esc(m.name)}</h3><p>${esc(m.role)} · ${m.role === "owner" ? "Company approval authority" : m.approval_limit_minor == null ? "No additional approval limit" : "Approval up to " + money(m.approval_limit_minor)}</p>${p.manage && m.role !== "owner" ? `<button data-purchasing-member="${esc(m.id)}" data-purchasing-revision="${p.revision}" data-purchasing-role="${esc(m.role)}" data-purchasing-limit="${m.approval_limit_minor ?? ""}">Manage access</button>` : ""}</article>`).join("")}</section>`;
  return html;
};
const dispatchBeforeQr = views.dispatch;
views.dispatch = async () => {
  const html = await dispatchBeforeQr();
  const tasks = (await request("/v1/logistics/tasks")).filter(
    (t) => t.status === "accepted",
  );
  return (
    html +
    (tasks.length
      ? `<section class="panel"><h2>Rider handovers</h2>${tasks.map((t) => `<article class="panel"><h3>${esc(t.reference)}</h3><p>${esc(t.rider_name || "Assigned rider")}</p><button data-handover-qr="${esc(t.id)}">Show handover QR</button></article>`).join("")}</section>`
      : "")
  );
};
async function journeyPhoto(file) {
  if (!file) return "";
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2000000)
    throw Error("Choose a PNG or JPEG image up to 2 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (
    !b ||
    !(
      b.hasAttribute("data-design-load") ||
      b.hasAttribute("data-facts-load") ||
      b.dataset.purchasingMember ||
      b.dataset.handoverQr
    )
  )
    return;
  b.disabled = true;
  try {
    if (b.hasAttribute("data-design-load")) {
      const f = b.closest("form"),
        reference = f.elements.reference.value.trim();
      const proof = await request(
        `/v1/journey/staff/orders/${encodeURIComponent(reference)}/design`,
      );
      f.dataset.loadedReference = reference;
      f.elements.revision.value = proof?.revision || 0;
      f.elements.description.value = proof?.description || "";
      f.querySelector("[data-design-state]").textContent = proof
        ? `Version ${proof.revision} · ${proof.state.replaceAll("_", " ")}${proof.customer_note ? " · Customer: " + proof.customer_note : ""}`
        : "No design published yet.";
      const image = f.querySelector("[data-design-photo]");
      image.hidden = !proof?.image_data;
      if (proof?.image_data) image.src = proof.image_data;
      else image.removeAttribute("src");
    }
    if (b.hasAttribute("data-facts-load")) {
      const f = b.closest("form"),
        id = Number(f.elements.identity.value);
      const p = await request(`/v1/journey/staff/products/${id}/facts`);
      f.dataset.loadedProduct = String(id);
      for (const key of ["revision", "ingredients", "handling", "source"])
        f.elements[key].value = p[key] ?? "";
      for (const key of ["contains", "may_contain", "dietary"])
        f.elements[key].value = p[key].join(", ");
      f.elements.published.checked = p.published;
    }
    if (b.dataset.purchasingMember) {
      const company = businessCompany;
      openEditor(
        "Purchasing access",
        `<fieldset><legend>Role</legend>${["buyer", "approver", "viewer"].map((r) => `<label><input type="radio" name="role" value="${r}" ${r === b.dataset.purchasingRole ? "checked" : ""}>${r === "buyer" ? "Purchaser" : r === "approver" ? "Approver" : "View only"}</label>`).join("")}</fieldset>${input("limit", "Approval limit in KES · blank for no additional limit", b.dataset.purchasingLimit === "" ? "" : Number(b.dataset.purchasingLimit) / 100, "number", 'min="0" step="0.01"')}`,
        async (f) => {
          if (businessCompany !== company)
            throw Error(
              "The active company changed. Reopen purchasing access.",
            );
          await request(`/v1/business/companies/${company}/purchasing`, "PUT", {
            revision: Number(b.dataset.purchasingRevision),
            customer_id: b.dataset.purchasingMember,
            role: f.get("role"),
            approval_limit_minor:
              f.get("role") === "approver" && f.get("limit") !== ""
                ? Math.round(Number(f.get("limit")) * 100)
                : null,
          });
          await show("corporate", true);
        },
      );
    }
    if (b.dataset.handoverQr) {
      const code = await request(
        `/v1/journey/staff/tasks/${b.dataset.handoverQr}/handover-code`,
        "POST",
        {},
      );
      openEditor(
        "Ready for your rider",
        `<div style="text-align:center"><img src="${esc(code.qr_data)}" alt="Trip handover QR" style="width:220px;max-width:100%;background:white;border-radius:18px"><h2>${esc(code.code)}</h2><p>Valid until ${esc(date(code.expires_at))}. Show this to the assigned rider.</p></div>`,
        null,
        true,
      );
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!form.matches("[data-design-form],[data-facts-form]")) return;
  e.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (form.matches("[data-design-form]")) {
      const reference = form.elements.reference.value.trim();
      if (reference !== form.dataset.loadedReference)
        throw Error("Open the current order design before publishing.");
      const photo = form.elements.photo.files[0];
      const p = await request(
        `/v1/journey/staff/orders/${encodeURIComponent(reference)}/design`,
        "PUT",
        {
          revision: Number(form.elements.revision.value),
          description: form.elements.description.value,
          image_data: photo
            ? await journeyPhoto(photo)
            : form.querySelector("[data-design-photo]").getAttribute("src") ||
              "",
        },
      );
      form.elements.revision.value = p.revision;
      form.querySelector("[data-design-state]").textContent =
        `Version ${p.revision} · Awaiting customer approval`;
      notice(
        "Design sent to the customer. Production waits for their approval.",
      );
    } else {
      const id = Number(form.elements.identity.value);
      if (String(id) !== form.dataset.loadedProduct)
        throw Error("Open the current product information before saving.");
      const data = {
        revision: Number(form.elements.revision.value),
        published: form.elements.published.checked,
      };
      for (const key of ["ingredients", "handling", "source"])
        data[key] = form.elements[key].value;
      for (const key of ["contains", "may_contain", "dietary"])
        data[key] = form.elements[key].value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      const p = await request(
        `/v1/journey/staff/products/${id}/facts`,
        "PUT",
        data,
      );
      form.elements.revision.value = p.revision;
      notice("Verified product information saved.");
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
});
