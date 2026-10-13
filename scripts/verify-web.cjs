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
const premium = process.env.CAKECITY_QA_PREMIUM === "1";
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
  const screenshots = [];
  const responsiveChecks = [];
  const liveProducts = new Map();
  const fixtureCart = {
    items: [],
    coupons: [],
    totals: { total_price: "0", currency_code: "KES", currency_minor_unit: 2 },
  };
  let memberFixture = false;
  let fixtureCartRequests = 0;
  let blockedWrites = 0;
  async function fixture(requestId, value, status = 200) {
    await send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
        {
          name: "Access-Control-Allow-Headers",
          value: "authorization,content-type,cart-token",
        },
        { name: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
        { name: "Access-Control-Expose-Headers", value: "Cart-Token" },
        { name: "Cart-Token", value: "qa-local-fixture-cart" },
      ],
      body: Buffer.from(JSON.stringify(value)).toString("base64"),
    });
  }
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      void (async () => {
        const targetUrl = new URL(request.url);
        if (
          premium &&
          targetUrl.origin === "https://cc-mobile-1.onrender.com"
        ) {
          if (request.method === "OPTIONS") return fixture(requestId, {});
          if (memberFixture) {
            if (targetUrl.pathname.startsWith("/v1/auth/mobile/"))
              return fixture(requestId, {
                access_token: "qa-local-member-fixture",
                refresh_token: "qa-local-member-fixture-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                customer: {
                  id: "qa-member",
                  email: "qa@example.invalid",
                  first_name: "QA Preview",
                  last_name: "Fixture",
                  phone: null,
                  role: "customer",
                },
              });
            if (targetUrl.pathname === "/v1/club")
              return fixture(requestId, {
                member_id: "00000000-0000-4000-8000-000000000001",
                points: 250,
                debt: 0,
                tier: "gold",
                next_tier: null,
                rules: {
                  earn_spend_kes: 100,
                  point_value_kes: 1,
                  expiry_days: 365,
                  minimum_redemption: 100,
                  minimum_order_multiple: 1,
                },
                redemption_available: false,
                coupons: [],
                activity: [],
              });
            if (targetUrl.pathname.startsWith("/v1/account/"))
              return fixture(requestId, []);
          }
          if (!["GET", "HEAD"].includes(request.method)) {
            blockedWrites++;
            return fixture(
              requestId,
              { message: "Production writes disabled in visual QA." },
              403,
            );
          }
        }
        if (
          premium &&
          targetUrl.origin === "https://cakecity.co.ke" &&
          targetUrl.pathname.startsWith("/wp-json/wc/store/v1/cart")
        ) {
          fixtureCartRequests++;
          if (request.method === "OPTIONS") return fixture(requestId, {});
          if (
            targetUrl.pathname.endsWith("/add-item") &&
            request.method === "POST"
          ) {
            const line = JSON.parse(request.postData);
            const product = liveProducts.get(line.id);
            if (!product)
              throw new Error(
                "Local cart fixture needs a verified live product",
              );
            fixtureCart.items = [
              { id: line.id, quantity: line.quantity, name: product.name },
            ];
            fixtureCart.totals.total_price = String(
              Number(product.prices.price) * line.quantity,
            );
          }
          return fixture(requestId, fixtureCart);
        }
        if (
          premium &&
          targetUrl.origin === "https://cakecity.co.ke" &&
          !["GET", "HEAD", "OPTIONS"].includes(request.method)
        ) {
          blockedWrites++;
          return fixture(
            requestId,
            { message: "Production writes disabled in visual QA." },
            403,
          );
        }
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
          if (premium && targetUrl.pathname.endsWith("/products")) {
            const records = JSON.parse(Buffer.from(bytes).toString());
            if (Array.isArray(records))
              records.forEach((product) =>
                liveProducts.set(product.id, product),
              );
          }
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
    screenshots.push(name);
  }
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    if (nativeTransport || premium)
      await send("Fetch.enable", {
        patterns: [
          {
            urlPattern: premium
              ? "https://cakecity.co.ke/wp-json/wc/store/v1/*"
              : "https://cakecity.co.ke/wp-json/wc/store/v1/products*",
            requestStage: "Request",
          },
          ...(premium
            ? [
                {
                  urlPattern: "https://cc-mobile-1.onrender.com/*",
                  requestStage: "Request",
                },
              ]
            : []),
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
    await visit("/", "Find your flavour");
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
      "document.querySelector('input[placeholder=\"No limit\"]')",
      "budget sheet",
    );
    await waitFor(
      "Array.from(document.querySelectorAll('[role=\"button\"]')).some(node => node.innerText.trim() === 'Apply' && node.getBoundingClientRect().bottom <= innerHeight && node.getBoundingClientRect().top > 0)",
      "budget sheet animation",
    );
    await capture("02b-budget-sheet");
    await evaluate(
      `document.querySelector('[aria-label="Under KSh 2,500"]').click()`,
    );
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.trim() === 'Apply').click()`,
    );
    await waitFor(
      "document.body.innerText.includes('Clear 0–2500 KSh budget') && !document.querySelector('input[placeholder=\"No limit\"]')",
      "applied budget",
    );
    await waitFor(
      "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
      "budget products",
    );
    if (!browseRequests.some((query) => query.get("max_price") === "250000"))
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
    await visit("/loyalty", "Welcome to the sweet life.");
    await evaluate(
      `Array.from(document.querySelectorAll('[role="button"]')).find(node => node.innerText.includes('Have a promo code?')).click()`,
    );
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
    if (premium) {
      for (const width of [320, 390, 430, 768]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: width >= 768 ? 1024 : 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        for (const [route, label] of [
          ["/", "Find your flavour"],
          ["/shop", "Shop"],
        ]) {
          await visit(route, label);
          await waitFor(
            "document.querySelector('[aria-label^=\"Quick add\"]') || document.querySelector('[aria-label^=\"Choose options for:\"]')",
            "responsive live products",
          );
          const overflow = await evaluate(
            "document.documentElement.scrollWidth > innerWidth + 1",
          );
          if (overflow)
            throw new Error(`Horizontal page overflow at ${width} on ${route}`);
          responsiveChecks.push({
            route,
            width,
            horizontal_page_overflow: false,
          });
          await capture(
            `responsive-${width}-${route === "/" ? "home" : "shop"}`,
          );
        }
      }
      await send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      for (const [route, label] of [
        ["/orders", "Your orders"],
        ["/favourites", "Saved cakes"],
        ["/addresses", "My addresses"],
        ["/moments", "Celebration calendar"],
        ["/celebration-builder", "Build a happy moment"],
        ["/custom", "The Cake Studio."],
        ["/requests", "Requests & support"],
        ["/offers", "Cake City offers"],
        ["/branches", "Cake City branches"],
        ["/notifications", "Notifications"],
        ["/legal", "The important details."],
        ["/help", "We're here to help."],
        ["/forgot-password", "Password help"],
        ["/reset-password", "Reset password"],
        ["/campaign-studio", "Campaign Studio"],
      ]) {
        await visit(route, label);
        await pause(250);
        await capture(`support-${route.slice(1)}`);
      }
      const simple = [...liveProducts.values()].find(
        (product) =>
          product.type === "simple" &&
          !product.variations.length &&
          product.is_in_stock &&
          product.is_purchasable,
      );
      if (!simple) throw new Error("No live simple product for bag QA");
      await visit(`/product/${simple.id}`, "Add to bag");
      await waitFor(
        "document.querySelector('[aria-label=\"Add one cake to bag\"]')",
        "available simple product",
      );
      await evaluate(
        "document.querySelector('[aria-label=\"Add one cake to bag\"]').click()",
      );
      await visit("/cart", "Your bag");
      await waitFor(
        "document.querySelector('[aria-label^=\"Increase \"]')",
        "populated bag",
      );
      await capture("bag-live-product");
      await evaluate(
        "document.querySelector('[aria-label^=\"Increase \"]').click()",
      );
      await waitFor(
        "JSON.parse(localStorage.getItem('cakecity.bag.v3')).state.lines[0].quantity === 2",
        "increased bag quantity",
      );
      await evaluate(
        "document.querySelector('[aria-label^=\"Decrease \"]').click()",
      );
      await waitFor(
        "JSON.parse(localStorage.getItem('cakecity.bag.v3')).state.lines[0].quantity === 1",
        "decreased bag quantity",
      );
      await visit("/checkout", "Secure checkout");
      await waitFor(
        "document.body.innerText.includes('Contact details')",
        "isolated fixture checkout",
      );
      if (
        await evaluate("document.body.innerText.includes('Promo code applied')")
      )
        throw new Error(
          "An empty coupon request was labelled as an applied discount",
        );
      if (await evaluate("document.body.innerText.includes('&#')"))
        throw new Error("Checkout displayed raw product-name HTML entities");
      await capture("checkout-local-cart-fixture");
      await evaluate(
        "document.querySelector('[aria-label=\"Send this order as a gift\"]').click()",
      );
      await waitFor(
        "document.body.innerText.includes('Recipient first name')",
        "gift fields",
      );
      await capture("checkout-gift-local-cart-fixture");
      await evaluate(
        "Array.from(document.querySelectorAll('div')).filter(node => node.scrollHeight > node.clientHeight + 100 && getComputedStyle(node).overflowY === 'auto').forEach(node => node.scrollTop = node.scrollHeight)",
      );
      await pause(250);
      await capture("checkout-summary-local-cart-fixture");
      memberFixture = true;
      await visit("/sign-in", "Welcome back.");
      await evaluate(`(() => {
        for (const [type, value] of [["email", "qa@example.invalid"], ["password", "local-fixture-only"]]) {
          const input = document.querySelector('input[type="' + type + '"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await evaluate(
        "Array.from(document.querySelectorAll('[role=\"button\"]')).find(node => node.innerText.trim() === 'Sign in').click()",
      );
      await waitFor(
        "!document.body.innerText.includes('Welcome back.')",
        "local fixture login",
      );
      // Web auth is intentionally memory-only: navigate inside the app so a
      // full document reload does not discard this isolated QA session.
      await evaluate(
        "document.querySelector('[aria-label=\"Cake City Club\"]').click()",
      );
      routes.push("/loyalty");
      await waitFor(
        "document.body.innerText.includes('Hello, QA Preview.')",
        "member Club route",
      );
      await waitFor(
        "document.querySelector('[aria-label=\"Flip membership card to show branch barcode\"]')",
        "local membership fixture",
      );
      await capture("club-local-member-fixture");
      await evaluate(
        "document.querySelector('[aria-label=\"Flip membership card to show branch barcode\"]').click()",
      );
      await pause(600);
      await capture("club-barcode-local-member-fixture");
      await evaluate(
        'document.querySelector(\'[role="tab"][aria-label="Account"]\').click()',
      );
      routes.push("/account");
      await waitFor(
        "document.body.innerText.includes('qa@example.invalid')",
        "member account route",
      );
      await capture("account-local-member-fixture");
    }
    if (exceptions.length)
      throw new Error("Unhandled browser exceptions: " + exceptions.join(", "));
    const result = {
      routes,
      unhandled_exceptions: exceptions.length,
      screenshots: screenshots.length,
      screenshot_files: screenshots,
      responsive_checks: responsiveChecks,
      populated_bag_quantity_verified: premium,
      checkout_visual_uses_local_cart_fixture: premium,
      membership_visual_uses_local_account_fixture: premium,
      local_cart_fixture_requests: fixtureCartRequests,
      blocked_production_writes: blockedWrites,
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
