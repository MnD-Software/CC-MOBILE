// One-pass smoke/visual check of a real Expo export in a disposable Edge profile.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(process.argv[2] || "artifacts/export");
const output = path.resolve(
  process.env.CAKECITY_QA_OUTPUT || "artifacts/visual-qa",
);
const port = Number(process.env.CAKECITY_QA_PORT || 8097);
const debugPort = Number(process.env.CAKECITY_CDP_PORT || 9322);
// Optional QA-only bridge: emulate native public GET transport when the live
// website rejects localhost CORS. Never intercept account, cart or order data.
const nativeTransport = process.env.CAKECITY_QA_NATIVE_TRANSPORT === "1";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
};
const server = http.createServer((request, response) => {
  try {
    const requested = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    let file = path.resolve(root, "." + requested);
    if (!file.startsWith(root + path.sep) && file !== root) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(root, "index.html");
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
  } catch {
    response.writeHead(500).end();
  }
});
async function main() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = (
        await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      ).find(
        (t) =>
          t.type === "page" &&
          (t.url === "about:blank" || t.url.startsWith("http://127.0.0.1:")),
      );
    } catch {}
    if (target) break;
    await pause(500);
  }
  if (!target)
    throw new Error(
      "Start a disposable headless Edge instance on the configured debugging port.",
    );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  const networkFailures = [];
  const browseRequests = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      void (async () => {
        const targetUrl = new URL(request.url);
        if (
          request.method !== "GET" ||
          targetUrl.origin !== "https://cakecity.co.ke" ||
          ![
            "/wp-json/wc/store/v1/products",
            "/wp-json/wc/store/v1/products/categories",
          ].includes(targetUrl.pathname)
        ) {
          await send("Fetch.continueRequest", { requestId });
          return;
        }
        try {
          const upstream = await fetch(targetUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(14000),
          });
          const bytes = await upstream.arrayBuffer();
          await send("Fetch.fulfillRequest", {
            requestId,
            responseCode: upstream.status,
            responseHeaders: [
              { name: "Content-Type", value: "application/json" },
              { name: "Access-Control-Allow-Origin", value: "*" },
              {
                name: "Access-Control-Expose-Headers",
                value: "X-WP-TotalPages",
              },
              ...(upstream.headers.has("X-WP-TotalPages")
                ? [
                    {
                      name: "X-WP-TotalPages",
                      value: upstream.headers.get("X-WP-TotalPages"),
                    },
                  ]
                : []),
            ],
            body: Buffer.from(bytes).toString("base64"),
          });
        } catch {
          await send("Fetch.failRequest", {
            requestId,
            errorReason: "Failed",
          }).catch(() => undefined);
        }
      })().catch(() => undefined);
    }
    if (message.method === "Network.requestWillBeSent") {
      const url = new URL(message.params.request.url);
      if (
        url.hostname === "cakecity.co.ke" &&
        url.pathname === "/wp-json/wc/store/v1/products"
      )
        browseRequests.push(url.searchParams);
    }
    if (message.method === "Runtime.exceptionThrown")
      exceptions.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    if (message.method === "Network.loadingFailed")
      networkFailures.push(message.params.errorText);
    const item = pending.get(message.id);
    if (item) {
      clearTimeout(item.timer);
      pending.delete(message.id);
      message.error
        ? item.reject(new Error(message.error.message))
        : item.resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  };
  async function waitFor(expression, label) {
    for (let i = 0; i < 240; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await pause(500);
    }
    throw new Error(
      "Timed out waiting for " +
        label +
        ": " +
        (await evaluate("document.body.innerText.slice(0,1200)")),
    );
  }
  const routes = [];
  async function visit(route, label) {
    await send("Page.bringToFront");
    await send("Page.navigate", { url: `http://127.0.0.1:${port}${route}` });
    await waitFor("document.body", "document body");
    await waitFor(
      `document.body.innerText.includes(${JSON.stringify(label)})`,
      route,
    );
    const text = await evaluate("document.body.innerText");
    if (text.includes("could not display this screen"))
      throw new Error("Error boundary on " + route);
    routes.push(route);
  }
  async function capture(name) {
    const result = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(output, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  }
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    if (nativeTransport)
      await send("Fetch.enable", {
        patterns: [
          {
            urlPattern: "https://cakecity.co.ke/wp-json/wc/store/v1/products*",
            requestStage: "Request",
          },
        ],
      });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit("/", "Make room for");
    await waitFor(
      "document.body.innerText.includes('DEALS & STEALS')",
      "live homepage product",
    );
    await pause(1000);
    await capture("01-home-mobile");
    await visit("/shop", "Shop");
    await waitFor(
      "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
      "live shop results",
    );
    await capture("02-shop-mobile");
    await evaluate(
      `document.querySelector('[aria-label="Filter by budget"]').click()`,
    );
    await waitFor(
      "document.body.innerText.includes('Find your sweet spot')",
      "budget sheet",
    );
    await waitFor(
      "Array.from(document.querySelectorAll('[role=\"button\"]')).some(node => node.innerText.trim() === 'Show cakes in my budget' && node.getBoundingClientRect().bottom <= innerHeight && node.getBoundingClientRect().top > 0)",
      "budget sheet animation",
    );
    await capture("02b-budget-sheet");
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.trim() === 'Under 2,500').click()`,
    );
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.trim() === 'Show cakes in my budget').click()`,
    );
    await waitFor(
      "document.body.innerText.includes('Clear budget') && !document.body.innerText.includes('Find your sweet spot')",
      "applied budget",
    );
    await waitFor(
      "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
      "budget products",
    );
    if (
      !browseRequests.some(
        (query) =>
          query.get("max_price") === "250000" &&
          query.get("orderby") === "price" &&
          query.get("order") === "asc",
      )
    )
      throw new Error("Budget was not sent to the live catalogue");
    await capture("02c-budget-results");
    await visit("/product/31055", "Blueberry Delight");
    await waitFor(
      "Array.from(document.images).some(img => img.currentSrc.includes('cakecity') && img.complete && img.naturalWidth > 0)",
      "product photograph",
    );
    await waitFor(
      "!document.body.innerText.includes('Loading exact live prices')",
      "product variation response",
    );
    await capture("03-product-mobile");
    await visit("/orders", "Your orders");
    await visit("/account", "A little more you.");
    await capture("04-account-mobile");
    await waitFor(
      "document.querySelector('[aria-label=\"Dark appearance\"]')",
      "appearance control",
    );
    await evaluate(
      `document.querySelector('[aria-label="Dark appearance"]').click()`,
    );
    await waitFor(
      "document.querySelector('[aria-label=\"Dark appearance\"]').getAttribute('aria-checked') === 'true'",
      "dark appearance selected",
    );
    await capture("04b-account-dark");
    await visit("/shop", "Shop");
    await waitFor(
      "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
      "dark catalogue",
    );
    await capture("04c-shop-dark");
    await visit("/account", "A little more you.");
    await waitFor(
      "document.querySelector('[aria-label=\"Dark appearance\"]').getAttribute('aria-checked') === 'true'",
      "persisted dark appearance",
    );
    await evaluate(
      `document.querySelector('[aria-label="Light appearance"]').click()`,
    );
    await waitFor(
      "document.querySelector('[aria-label=\"Light appearance\"]').getAttribute('aria-checked') === 'true'",
      "light appearance selected",
    );
    await visit("/loyalty", "Your coupon wallet");
    await waitFor(
      "document.querySelector('input[placeholder=\"Enter your code\"]')",
      "coupon input",
    );
    await capture("04d-club-wallet");
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Enter your code"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'qa-display-only');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(
      "Array.from(document.querySelectorAll('[role=\"button\"]')).some(node => node.innerText.trim() === 'Save coupon' && node.getAttribute('aria-disabled') !== 'true')",
      "save coupon enabled",
    );
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.trim() === 'Save coupon').click()`,
    );
    await waitFor(
      "document.querySelector('[aria-label=\"Remove coupon qa-display-only\"]')",
      "saved guest coupon",
    );
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.trim() === 'Use at checkout').click()`,
    );
    await waitFor(
      "document.body.innerText.includes('Selected for checkout - eligibility not yet verified')",
      "selected coupon remains unverified",
    );
    await capture("04e-club-selected-code");
    await evaluate(
      `document.querySelector('[aria-label="Remove coupon qa-display-only"]').click()`,
    );
    await waitFor(
      "!document.querySelector('[aria-label=\"Remove coupon qa-display-only\"]')",
      "removed guest coupon",
    );
    await visit("/register", "Create account");
    await capture("05-register-mobile");
    await visit("/cart", "Your bag");
    await visit("/checkout", "Secure checkout");
    await waitFor(
      "document.body.innerText.includes('Your bag is empty')",
      "empty checkout recovery",
    );
    await send("Emulation.setDeviceMetricsOverride", {
      width: 834,
      height: 1112,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit("/shop", "Shop");
    await waitFor(
      "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
      "tablet catalogue",
    );
    await capture("06-shop-tablet");
    if (exceptions.length)
      throw new Error("Unhandled browser exceptions: " + exceptions.join(", "));
    const result = {
      routes,
      unhandled_exceptions: exceptions.length,
      screenshots: 12,
      budget_filter_verified: true,
      appearance_persistence_verified: true,
      guest_coupon_save_select_remove_verified: true,
      real_catalogue: true,
      native_glass_verified: false,
      public_catalogue_native_transport_bridge: nativeTransport,
      payment_submitted: false,
    };
    fs.writeFileSync(
      path.join(output, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await capture("failure").catch(() => undefined);
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { error: error.message, networkFailures, exceptions },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await send("Browser.close").catch(() => undefined);
    socket.close();
    server.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  server.close();
  process.exitCode = 1;
});
