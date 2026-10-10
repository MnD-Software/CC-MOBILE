// Disposable browser QA. Only public product GETs reach Cake City; editorial
// fixtures are explicitly labelled. No real account, payment or order writes.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(
  process.argv[2] || "artifacts/editorial-release/export-web",
);
const output = path.resolve("artifacts/editorial-release/qa");
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
      if (message.method === "Fetch.requestPaused") {
        const { requestId, request } = message.params;
        const url = new URL(request.url);
        void (async () => {
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
      ],
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit("/", "Search cakes");
    await wait(
      `document.body.innerText.includes('QA Cake spotlight')`,
      "shoppable stories",
    );
    await capture("01-home-stories");
    checks.push({ check: "Home story rendered", real_product_id: product.id });
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
      `document.body.innerText.includes('Your bag')&&document.body.innerText.includes('Checkout')`,
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
    if (errors.length)
      throw new Error("Browser exceptions: " + errors.join("\n"));
    const result = {
      checks,
      unhandled_exceptions: errors.length,
      editorial_fixture: true,
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
