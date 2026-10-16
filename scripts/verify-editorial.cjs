// Disposable browser QA. Only public product GETs reach Cake City; editorial
// fixtures are explicitly labelled. No real account, payment or order writes.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const studioOnly = process.argv.includes("--studio");
const root = path.resolve(
  process.argv[2] || "artifacts/editorial-release/export-web",
);
const output = path.resolve(
  studioOnly ? "artifacts/studio-release/qa" : "artifacts/editorial-release/qa",
);
const debugPort = 9348,
  port = 8099;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [],
  errors = [];
const server = http.createServer((request, response) => {
  const filename = path.resolve(
    root,
    "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname),
  );
  if (filename !== root && !filename.startsWith(root + path.sep))
    return response.writeHead(403).end();
  const target =
    fs.existsSync(filename) && fs.statSync(filename).isFile()
      ? filename
      : path.join(root, "index.html");
  response.setHeader(
    "Content-Type",
    {
      ".html": "text/html",
      ".js": "application/javascript",
      ".png": "image/png",
      ".ttf": "font/ttf",
      ".css": "text/css",
      ".json": "application/json",
    }[path.extname(target)] || "application/octet-stream",
  );
  fs.createReadStream(target).pipe(response);
});
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const catalogue = await (
    await fetch(
      "https://cakecity.co.ke/wp-json/wc/store/v1/products?search=black%20forest&per_page=8",
      { signal: AbortSignal.timeout(20000) },
    )
  ).json();
  const product = catalogue.find(
    (row) => row.is_in_stock && row.is_purchasable && row.images?.length,
  );
  if (!product) throw new Error("Live cake unavailable for QA");
  const now = Date.now();
  const studioCampaigns = [];
  const studioProducts = [];
  const uploads = new Map();
  const campaign = {
    id: "qa-spotlight",
    revision: 1,
    title: "QA Cake spotlight",
    description:
      "Editorial test fixture linked to a real cake. Prices come from WooCommerce.",
    image_url: product.images[0].src,
    video_url: "",
    starts_at: new Date(now - 3600000).toISOString(),
    ends_at: new Date(now + 3600000).toISOString(),
    product_slugs: [product.slug],
    category_id: null,
    branch_names: [],
    member_only: false,
    published: true,
    template: "spotlight",
  };
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const browserPath = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] +
      "\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(fs.existsSync);
  if (!browserPath) throw new Error("Browser not installed");
  const profile = path.join(
    process.env.LOCALAPPDATA,
    "CakeCity-QA",
    `editorial-${Date.now()}`,
  );
  const child = spawn(
    browserPath,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let socket;
  try {
    let target;
    for (let i = 0; i < 50; i++) {
      try {
        target = (
          await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
        ).find((item) => item.type === "page");
      } catch {}
      if (target) break;
      await pause(250);
    }
    if (!target) throw new Error("Disposable browser did not start");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    let fileNode;
    const pending = new Map();
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 25000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function fulfill(requestId, payload, status = 200) {
      await send("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Access-Control-Allow-Origin", value: "*" },
          {
            name: "Access-Control-Allow-Headers",
            value: "authorization,content-type",
          },
          {
            name: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,OPTIONS",
          },
        ],
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      });
    }
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = pending.get(message.id);
        if (item) {
          clearTimeout(item.timer);
          pending.delete(message.id);
          message.error
            ? item.reject(new Error(message.error.message))
            : item.resolve(message.result);
        }
      }
      if (message.method === "Runtime.exceptionThrown")
        errors.push(
          message.params.exceptionDetails.text +
            " " +
            (message.params.exceptionDetails.exception?.description || ""),
        );
      if (message.method === "Page.fileChooserOpened")
        fileNode = message.params.backendNodeId;
      if (message.method === "Fetch.requestPaused") {
        const { requestId, request } = message.params;
        const url = new URL(request.url);
        void (async () => {
          if (studioOnly && url.origin === "https://cc-mobile-1.onrender.com") {
            if (request.method === "OPTIONS") return fulfill(requestId, {});
            if (url.pathname.startsWith("/v1/auth/mobile/"))
              return fulfill(requestId, {
                access_token: "qa-staff-fixture",
                refresh_token: "qa-staff-fixture-token-32-characters-long",
                token_type: "bearer",
                expires_in: 3600,
                customer: {
                  id: "qa-staff",
                  email: "qa@example.invalid",
                  first_name: "QA",
                  last_name: "Staff",
                  phone: null,
                  role: "staff",
                },
              });
            if (
              url.pathname === "/v1/admin/content" &&
              request.method === "GET"
            )
              return fulfill(requestId, [
                ...studioCampaigns,
                ...studioProducts,
              ]);
            if (
              url.pathname === "/v1/admin/content/assets" &&
              request.method === "POST"
            ) {
              const body = JSON.parse(request.postData);
              const bytes = Buffer.from(body.data, "base64");
              if (bytes.length > 2000000)
                throw Error(
                  "Photo was not automatically resized under the upload limit",
                );
              const hash = require("node:crypto")
                .createHash("sha256")
                .update(bytes)
                .digest("hex");
              uploads.set(hash, { bytes, mime: body.mime });
              checks.push({
                check: "Gallery photo prepared and uploaded",
                bytes: bytes.length,
                mime: body.mime,
                production_write: false,
              });
              return fulfill(
                requestId,
                { url: "/v1/content/assets/" + hash },
                201,
              );
            }
            if (url.pathname.startsWith("/v1/content/assets/")) {
              const asset = uploads.get(url.pathname.split("/").pop());
              if (asset)
                return send("Fetch.fulfillRequest", {
                  requestId,
                  responseCode: 200,
                  responseHeaders: [
                    { name: "Content-Type", value: asset.mime },
                    { name: "Access-Control-Allow-Origin", value: "*" },
                  ],
                  body: asset.bytes.toString("base64"),
                });
            }
            if (
              url.pathname.startsWith("/v1/admin/content/campaigns") &&
              ["POST", "PUT"].includes(request.method)
            ) {
              const body = JSON.parse(request.postData);
              const id =
                request.method === "POST"
                  ? "qa-studio"
                  : url.pathname.split("/").pop();
              const saved = { ...body, id, revision: body.revision + 1 };
              const old = studioCampaigns.findIndex((row) => row.id === id);
              if (old >= 0) studioCampaigns[old] = saved;
              else studioCampaigns.push(saved);
              return fulfill(requestId, saved);
            }
            if (
              url.pathname.startsWith("/v1/admin/content/products/") &&
              request.method === "PUT"
            ) {
              const body = JSON.parse(request.postData);
              const saved = { ...body, revision: body.revision + 1 };
              studioProducts.push(saved);
              return fulfill(requestId, saved);
            }
            if (url.pathname.startsWith("/v1/account/"))
              return fulfill(requestId, []);
            if (url.pathname.startsWith("/v1/club"))
              return fulfill(
                requestId,
                { detail: "Club is outside the staff fixture" },
                503,
              );
            if (!["GET", "OPTIONS"].includes(request.method))
              throw Error(
                "Unexpected production mutation blocked: " + url.pathname,
              );
          }
          if (request.method === "GET" && url.pathname === "/v1/content")
            return fulfill(requestId, { campaigns: [campaign] });
          if (
            request.method === "GET" &&
            url.pathname.startsWith("/v1/content/products/")
          )
            return fulfill(requestId, null);
          if (
            request.method === "GET" &&
            url.origin === "https://cakecity.co.ke" &&
            url.pathname.startsWith("/wp-json/wc/store/v1/products")
          ) {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(20000),
            });
            return fulfill(requestId, await response.json(), response.status);
          }
          await send("Fetch.continueRequest", { requestId });
        })().catch(async (error) => {
          errors.push(error.message);
          await fulfill(
            requestId,
            { detail: "QA transport failed" },
            502,
          ).catch(() => {});
        });
      }
    });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        );
      return result.result.value;
    }
    async function wait(expression, label) {
      for (let i = 0; i < 120; i++) {
        if (await evaluate(`Boolean(document.body && (${expression}))`)) return;
        await pause(250);
      }
      throw new Error(
        "Missing UI state: " +
          label +
          "\n" +
          (await evaluate("document.body.innerText.slice(0,1800)")),
      );
    }
    async function visit(route, text) {
      await send("Page.navigate", { url: `http://127.0.0.1:${port}${route}` });
      await wait(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
        text,
      );
    }
    async function click(label) {
      const names = await evaluate(
        `Array.from(document.querySelectorAll('[role="button"]')).map(n=>n.getAttribute('aria-label')||n.innerText?.trim())`,
      );
      if (!names.includes(label)) throw new Error("Control missing: " + label);
      await evaluate(
        `Array.from(document.querySelectorAll('[role="button"]')).find(n=>(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)}).click()`,
      );
    }
    async function fill(label, value) {
      await evaluate(
        `(()=>{const node=document.querySelector('input[aria-label=${JSON.stringify(label)}],textarea[aria-label=${JSON.stringify(label)}]');if(!node)throw Error('Input missing');const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
      );
      await pause(150);
    }
    async function capture(name) {
      const image = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(output, name + ".png"),
        Buffer.from(image.data, "base64"),
      );
    }
    async function fit(label) {
      const width = await evaluate("document.documentElement.clientWidth");
      const overflow = await evaluate(
        `Array.from(document.querySelectorAll('input,[role="button"]')).filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=0&&r.left<innerWidth&&r.right>innerWidth+2&&!n.closest('[aria-label="Cake City navigation"]')}).map(n=>n.getAttribute('aria-label')||n.innerText).slice(0,5)`,
      );
      checks.push({ check: label, width, overflow });
      if (overflow.length)
        throw new Error(label + " overflow: " + overflow.join(","));
    }
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Fetch.enable", {
      patterns: [
        { urlPattern: "https://cc-mobile-1.onrender.com/v1/content*" },
        { urlPattern: "https://cakecity.co.ke/wp-json/wc/store/v1/products*" },
        ...(studioOnly
          ? [{ urlPattern: "https://cc-mobile-1.onrender.com/v1/*" }]
          : []),
      ],
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    if (!studioOnly) {
      await visit("/", "Search cakes");
      await wait(
        `document.body.innerText.includes('QA Cake spotlight')`,
        "shoppable stories",
      );
      await capture("01-home-stories");
      checks.push({
        check: "Home story rendered",
        real_product_id: product.id,
      });
      const storyName = await evaluate(
        `Array.from(document.querySelectorAll('[role="button"]')).map(n=>n.getAttribute('aria-label')).find(n=>n?.startsWith('QA Cake spotlight.'))`,
      );
      await click(storyName);
      await wait(
        `document.body.innerText.includes('Shop this story')`,
        "story product links",
      );
      await wait(
        `document.querySelector('[aria-label^="Choose options for:"]')||document.querySelector('[aria-label^="Quick add"]')`,
        "real story cake",
      );
      await capture("02-story-detail");
      checks.push({
        check: "Story linked to real cake",
        price_source: "WooCommerce",
      });
      await visit(
        `/product/${product.id}?slug=${encodeURIComponent(product.slug)}`,
        "About this cake",
      );
      await wait(
        `document.querySelector('[aria-label^="View photo"]')`,
        "gallery",
      );
      const galleryName = await evaluate(
        `document.querySelector('[aria-label^="View photo"]').getAttribute('aria-label')`,
      );
      await click(galleryName);
      await wait(
        `document.body.innerText.includes('Photo 1 of')`,
        "fullscreen gallery",
      );
      await capture("03-gallery");
      await click("Close photo");
      checks.push({ check: "Gallery opens and closes" });
      await visit("/celebration-builder", "Build a happy moment");
      await capture("04-planner");
      await fit("Planner at 390px");
      await click("Save my plan for later");
      await wait(
        `document.body.innerText.includes('Your plan is saved on this device.')`,
        "saved plan",
      );
      await click("Find my cakes");
      await wait(
        `document.body.innerText.includes('Confirm servings with the bakery')||document.body.innerText.includes('servings')`,
        "real planner recommendations",
      );
      await capture("05-recommendations");
      const choice = await evaluate(
        `Array.from(document.querySelectorAll('[role="button"]')).find(n=>n.getAttribute('aria-label')?.startsWith('Choose options for:'))?.getAttribute('aria-label')`,
      );
      if (!choice) throw new Error("No selectable recommended cake");
      await click(choice);
      await wait(
        `document.body.innerText.includes('A finishing touch')`,
        "planner customization",
      );
      const options = await evaluate(
        `Array.from(document.querySelectorAll('[role="button"]')).filter(n=>/Kg|kg/.test(n.innerText)).map(n=>n.getAttribute('aria-label')||n.innerText.trim())`,
      );
      if (options.length) await click(options[0]);
      await wait(
        `Array.from(document.querySelectorAll('[role="button"]')).some(n=>n.innerText==='Add my celebration to bag'&&n.getAttribute('aria-disabled')!=='true')`,
        "confirmed cake price",
      );
      await capture("06-combined-plan");
      await click("Add my celebration to bag");
      await wait(
        `document.body.innerText.includes('Your bag')&&document.body.innerText.includes('Secure checkout for all items')`,
        "plan in bag",
      );
      await capture("07-bag");
      checks.push({
        check: "Planner selected real option and added bag",
        payment_submitted: false,
      });
      for (const width of [320, 430, 768]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await visit("/celebration-builder", "Build a happy moment");
        await fit(`Planner ${width}px`);
        await capture("planner-" + width);
      }
      await visit("/campaign-studio", "Campaign Studio is available");
      checks.push({ check: "Staff studio hidden from guest" });
    } else {
      await visit("/sign-in", "Welcome back.");
      await fill("Email address", "qa@example.invalid");
      await fill("Password", "qa-local-fixture");
      await click("Sign in");
      await wait(
        `!document.body.innerText.includes('Welcome back.')`,
        "staff fixture sign-in",
      );
      await evaluate(
        `(()=>{const node=Array.from(document.querySelectorAll('[role="button"],[role="tab"],a')).find(n=>n.getAttribute('aria-label')==='Profile'||n.innerText?.trim()==='Profile');if(!node)throw Error('Profile control missing');node.click();return true})()`,
      );
      await wait(
        `document.body.innerText.includes('Campaign Studio')`,
        "staff entry",
      );
      await evaluate(
        `(()=>{Array.from(document.querySelectorAll('[role="button"],a')).find(n=>n.innerText?.includes('Campaign Studio')).click();return true})()`,
      );
      await wait(
        `document.body.innerText.includes('Create a story')`,
        "studio dashboard",
      );
      await capture("01-studio");
      await click("Create a story");
      await click("Next: choose cakes");
      await wait(
        `document.body.innerText.includes('Add a photo to bring')`,
        "photo validation",
      );
      await send("Page.setInterceptFileChooserDialog", { enabled: true });
      await click("Add story photo");
      for (let i = 0; i < 40 && !fileNode; i++) await pause(250);
      if (!fileNode) throw Error("Photo chooser did not open");
      await send("DOM.setFileInputFiles", {
        backendNodeId: fileNode,
        files: [path.resolve("assets/cake-city-splash.png")],
      });
      await wait(
        `document.querySelector('[aria-label="Change story photo"]')`,
        "prepared gallery photo",
      );
      await fill("Story name", "QA Studio story");
      await fill(
        "A few words (optional)",
        "Local QA fixture. Never published to production.",
      );
      await capture("02-photo-and-words");
      await fit("Studio photo step at 390px");
      await click("Next: choose cakes");
      await click("Find cakes");
      await wait(
        `document.querySelector('[aria-label^="Select "]')`,
        "real cake picker",
      );
      await capture("03-cake-picker");
      const cakeLabel = await evaluate(
        `document.querySelector('[aria-label^="Select "]').getAttribute('aria-label')`,
      );
      await evaluate(
        `Array.from(document.querySelectorAll('[role="checkbox"]')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(cakeLabel)}).click()`,
      );
      await wait(
        `document.body.innerText.includes('Done · 1 selected')`,
        "cake selection",
      );
      await click("Done · 1 selected");
      await click("Preview my story");
      await capture("04-story-preview");
      await fit("Studio preview at 390px");
      for (const width of [320, 430, 768]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await fit("Studio preview " + width + "px");
        await capture("preview-" + width);
      }
      if (
        await evaluate(
          `document.body.innerText.includes('ISO date')||document.body.innerText.includes('product slugs')||document.body.innerText.includes('category ID')`,
        )
      )
        throw Error("Technical fields still visible in main flow");
      await click("Publish story");
      await wait(
        `document.body.innerText.includes('Your story is live.')`,
        "publish confirmation",
      );
      if (
        studioCampaigns.length !== 1 ||
        !studioCampaigns[0].published ||
        studioCampaigns[0].product_slugs.length !== 1
      )
        throw Error("Studio did not save the actual chosen cake");
      checks.push({
        check: "Three-step story published through local fixture",
        selected_cake: studioCampaigns[0].product_slugs[0],
        production_write: false,
      });
      await capture("05-published");
      await click("Edit QA Studio story. Live");
      await click("Next: choose cakes");
      await click("Preview my story");
      await click("Unpublish and save as draft");
      await wait(
        `document.body.innerText.includes('Your draft is saved.')`,
        "draft confirmation",
      );
      if (studioCampaigns[0].published || studioCampaigns[0].revision !== 2)
        throw Error("Draft revision not saved");
      checks.push({
        check: "Existing story reopened and unpublished with its revision",
        production_write: false,
      });
      await click("Cake details");
      await click("Choose a cake");
      await wait(
        `document.querySelector('[aria-label^="Select "]')`,
        "cake details picker",
      );
      await evaluate(
        `document.querySelector('[aria-label^="Select "]').click()`,
      );
      await wait(
        `document.querySelector('input[aria-label="Flavour"]')`,
        "readable cake editor",
      );
      await fill("Flavour", "Confirmed QA flavour");
      await fill("Preparation time in hours", "24");
      await click("Publish cake details");
      await wait(
        `document.body.innerText.includes('Your cake details are published.')`,
        "cake details saved",
      );
      if (studioProducts[0]?.preparation_hours !== 24)
        throw Error("Cake selection/details were not saved");
      checks.push({
        check: "Cake details chosen by name and saved through fixture",
        production_write: false,
      });
    }
    if (errors.length)
      throw new Error("Browser exceptions: " + errors.join("\n"));
    const result = {
      checks,
      unhandled_exceptions: errors.length,
      editorial_fixture: true,
      staff_fixture: studioOnly,
      real_catalogue: true,
      native_device_tested: false,
      payment_submitted: false,
    };
    fs.writeFileSync(
      path.join(output, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
    await send("Browser.close").catch(() => {});
  } catch (error) {
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify({ error: error.message, errors, checks }, null, 2),
    );
    throw error;
  } finally {
    socket?.close();
    child.kill();
    server.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  server.close();
  process.exitCode = 1;
});
