// Render and exercise the actual Expo app in a disposable mobile browser.
// The public catalogue is relayed unchanged to avoid localhost-only CORS issues.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const output = path.resolve("artifacts/reference-ui");
const base = process.env.CAKECITY_QA_URL || "http://127.0.0.1:8081";
const port = 9337;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = spawn(
    process.env.CAKECITY_QA_BROWSER ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=" + port,
      "--user-data-dir=" +
        path.join(os.tmpdir(), "cakecity-reference-qa-" + Date.now()),
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      target = (
        await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
      ).find((item) => item.type === "page");
    } catch {}
    if (!target) await pause(500);
  }
  if (!target) throw new Error("Could not open the disposable browser.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const checks = [];
  const publicResponses = [];
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Browser timeout: " + method));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      try {
        const response = await fetch(request.url, {
          signal: AbortSignal.timeout(20000),
          headers: { Accept: "application/json" },
        });
        const body = await response.text();
        publicResponses.push({ url: request.url, status: response.status });
        await send("Fetch.fulfillRequest", {
          requestId,
          responseCode: response.status,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: "*" },
            {
              name: "Access-Control-Expose-Headers",
              value: "x-wp-total,x-wp-totalpages",
            },
            {
              name: "x-wp-total",
              value: response.headers.get("x-wp-total") || "0",
            },
            {
              name: "x-wp-totalpages",
              value: response.headers.get("x-wp-totalpages") || "1",
            },
          ],
          body: Buffer.from(body).toString("base64"),
        });
      } catch {
        await send("Fetch.failRequest", {
          requestId,
          errorReason: "ConnectionFailed",
        }).catch(() => {});
      }
      return;
    }
    const item = pending.get(message.id);
    if (item) {
      clearTimeout(item.timer);
      pending.delete(message.id);
      message.error
        ? item.reject(new Error(message.error.message))
        : item.resolve(message.result);
    }
  });
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression, label, seconds = 30) {
    for (let i = 0; i < seconds * 2; i++) {
      if (await evaluate(expression)) return;
      await pause(500);
    }
    throw new Error(
      "Waiting for " +
        label +
        ": " +
        (await evaluate("document.body.innerText.slice(0,1600)")),
    );
  }
  async function visit(route, text) {
    await send("Page.navigate", { url: base + route });
    await waitFor(
      "document.body.innerText.replace(/\\s+/g, ' ').includes(" +
        JSON.stringify(text) +
        ")",
      route,
      240,
    );
    await waitFor('document.fonts.status === "loaded"', "fonts");
    await pause(700);
  }
  async function click(label) {
    const count = await evaluate(
      "document.querySelectorAll(" +
        JSON.stringify('[aria-label="' + label + '"]') +
        ").length",
    );
    if (count !== 1)
      throw new Error("Expected one control: " + label + "; found " + count);
    await evaluate(
      "document.querySelector(" +
        JSON.stringify('[aria-label="' + label + '"]') +
        ").click()",
    );
  }
  async function capture(name) {
    const capture = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(output, name + ".png"),
      Buffer.from(capture.data, "base64"),
    );
    console.log("Captured " + name);
    const measure = await evaluate(
      "({ viewport:innerWidth, document:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth })",
    );
    if (measure.scroll > measure.viewport)
      throw new Error(
        "Horizontal overflow on " + name + ": " + JSON.stringify(measure),
      );
    checks.push({ screen: name, ...measure });
  }
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Fetch.enable", {
      patterns: [
        { urlPattern: "https://cakecity.co.ke/wp-json/wc/store/v1/*" },
      ],
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit("/", "Bestsellers");
    await waitFor(
      "Array.from(document.images).every(image => image.complete)",
      "reference artwork",
    );
    await capture("01-home-390");
    await click("Save Red Velvet Dream to favourites");
    await waitFor(
      "!!document.querySelector('[aria-label=\"Remove Red Velvet Dream from favourites\"]')",
      "saved favourite",
    );
    await click("Favourites");
    await waitFor(
      'document.body.innerText.replace(/\\s+/g, " ").includes("Red Velvet Dream")',
      "favourites listing",
    );
    checks.push({ interaction: "save and open favourite", passed: true });
    await visit("/shop", "Chocolate Fudge Delight");
    await capture("02-cakes-390");
    await click("Open filters");
    await waitFor(
      'document.body.innerText.includes("Sort and refine")',
      "filter panel",
    );
    await capture("04-filters-390");
    await click("Close filters");
    await evaluate(
      '(() => { const input = document.querySelector(\'[aria-label="Search Cake City"]\'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(input,"Lotus"); input.dispatchEvent(new Event("input",{bubbles:true})); })()',
    );
    await waitFor(
      "document.querySelectorAll('[aria-label^=\"Lotus Biscoff Cheesecake,\"]').length===1 && !document.querySelector('[aria-label^=\"Chocolate Fudge Delight,\"]')",
      "filtered catalogue",
    );
    checks.push({ interaction: "search and filters", passed: true });
    await visit("/product/-101", "Product Details");
    await waitFor(
      'document.body.innerText.includes("Chocolate Fudge Delight")',
      "reference product",
    );
    await capture("03-product-390");
    await click("Increase quantity");
    await waitFor(
      "!!document.querySelector('[aria-label=\"Quantity 2\"]')",
      "quantity increment",
    );
    await evaluate(
      'Array.from(document.querySelectorAll(\'[role="button"]\')).find(element => element.innerText === "1.5 Kg").click()',
    );
    await waitFor(
      'Array.from(document.querySelectorAll(\'[role="button"]\')).some(element => element.innerText === "1.5 Kg" && element.getAttribute("aria-selected")==="true")',
      "size selection",
    );
    await click("Add to Cart");
    await waitFor(
      'document.body.innerText.includes("catalogue listing")',
      "unmapped product guard",
    );
    const bag = await evaluate('localStorage.getItem("cakecity.bag.v2")');
    if (bag && JSON.parse(bag).state.lines.length)
      throw new Error("Unconfirmed reference product entered the cart.");
    checks.push({
      interaction: "quantity, size, and unconfirmed cart guard",
      passed: true,
    });
    for (const width of [360, 430]) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height: width === 360 ? 800 : 932,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await visit("/", "Bestsellers");
      await capture("home-" + width);
      await visit("/product/-101", "Product Details");
      await capture("product-" + width);
    }
    if (errors.length)
      throw new Error("Unhandled browser errors: " + errors.join(", "));
    const result = {
      reference_content:
        "owner-supplied design content; not verified live availability",
      checks,
      publicResponses,
      unhandled_errors: errors,
    };
    fs.writeFileSync(
      path.join(output, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await Promise.race([send("Browser.close").catch(() => {}), pause(1500)]);
    socket.close();
    browser.kill();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.resolve({});
    }
    pending.clear();
  }
}
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
