// Browser smoke check against the running isolated preview, never production.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const directory = path.resolve(__dirname, "../artifacts/local-preview");
const origin = "http://localhost:8082";
const apiOrigin = "http://127.0.0.1:8010";
const checks = [];
const errors = [];
let checkoutReference;
let delayPhotos = process.argv.includes("--polish");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  assert.equal(
    (await (await fetch(apiOrigin + "/local-preview/status")).json())
      .local_preview,
    true,
  );
  const credentials = JSON.parse(
    fs.readFileSync(
      process.env.CAKECITY_QA_CREDENTIALS ||
        path.join(directory, "credentials.json"),
      "utf8",
    ),
  );
  const browser = [
    path.join(
      process.env.PROGRAMFILES || "",
      "Google/Chrome/Application/chrome.exe",
    ),
    path.join(
      process.env.PROGRAMFILES || "",
      "Google/Chrome/Application/chrome.exe",
    ),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Microsoft/Edge/Application/msedge.exe",
    ),
  ].find(fs.existsSync);
  if (!browser)
    throw new Error(
      "Install Chrome or Edge to run the local Windows browser check.",
    );
  const browserProfiles = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "CakeCity-QA",
  );
  fs.mkdirSync(browserProfiles, { recursive: true });
  const profile = fs.mkdtempSync(path.join(browserProfiles, "local-review-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--remote-debugging-port=9349",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "--disable-sync",
      "--no-default-browser-check",
      "about:blank",
    ],
    {
      windowsHide: true,
      stdio: [
        "ignore",
        "ignore",
        fs.openSync(path.join(directory, "browser-startup.log"), "w"),
      ],
    },
  );
  let socket;
  let send;
  try {
    let target;
    for (let i = 0; i < 120; i++) {
      try {
        let response;
        for (const host of ["127.0.0.1", "[::1]"]) {
          try {
            response = await fetch(`http://${host}:9349/json/list`);
            if (response.ok) break;
          } catch {}
        }
        if (response?.ok)
          target = (await response.json()).find(
            (tab) => tab.type === "page" && !tab.url.startsWith("edge://"),
          );
      } catch {}
      if (target) break;
      await pause(500);
    }
    assert.ok(target, "Disposable browser did not start");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Browser timeout: " + method));
        }, 30000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        clearTimeout(item.timeout);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown")
        errors.push(
          message.params.exceptionDetails.exception?.description ||
            message.params.exceptionDetails.text,
        );
      if (message.method === "Fetch.requestPaused") {
        const request = message.params.request;
        const url = new URL(request.url);
        const local = [origin, apiOrigin].includes(url.origin);
        if (!local && !["GET", "OPTIONS"].includes(request.method)) {
          errors.push("Blocked external write: " + url.origin + url.pathname);
          void send("Fetch.failRequest", {
            requestId: message.params.requestId,
            errorReason: "BlockedByClient",
          }).catch((error) => {
            if (!/Invalid InterceptionId|closed/i.test(error.message))
              errors.push(error.message);
          });
        } else {
          const resume = () =>
            void send("Fetch.continueRequest", {
              requestId: message.params.requestId,
            }).catch((error) => {
              if (!/Invalid InterceptionId|closed/i.test(error.message))
                errors.push(error.message);
            });
          if (
            delayPhotos &&
            message.params.resourceType === "Image" &&
            /\/v1\/(app-media|content\/assets)/.test(url.pathname)
          )
            setTimeout(resume, 2500);
          else resume();
        }
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
    async function observe(name) {
      const state = await evaluate(
        `({url:location.pathname,inputs:Array.from(document.querySelectorAll('input,textarea')).filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label'),type:n.type})),buttons:Array.from(document.querySelectorAll('[role="button"],button,a')).filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label')||n.innerText?.trim(),href:n.getAttribute('href')})),text:document.body.innerText.slice(0,6500)})`,
      );
      fs.writeFileSync(
        path.join(directory, name + ".json"),
        JSON.stringify(state, null, 2),
      );
      return state;
    }
    async function wait(expression, label, timeout = 60000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(`Boolean(document.body && (${expression}))`))
            return;
        } catch {}
        await pause(300);
      }
      await observe("browser-failure");
      throw new Error(
        "Missing UI state: " +
          label +
          ". See artifacts/local-preview/browser-failure.json",
      );
    }
    async function fill(label, value, scope) {
      const state = await observe("browser-latest");
      assert.equal(
        scope
          ? await evaluate(
              `Array.from(document.querySelector(${JSON.stringify(scope)}).querySelectorAll('input,textarea')).filter(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}).length`,
            )
          : state.inputs.filter((item) => item.label === label).length,
        1,
        "Input must be unique: " + label,
      );
      await evaluate(
        `(()=>{const root=${scope ? `document.querySelector(${JSON.stringify(scope)})` : "document"};const n=Array.from(root.querySelectorAll('input,textarea')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)});const p=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await pause(100);
    }
    async function click(label) {
      const state = await observe("browser-latest");
      assert.equal(
        state.buttons.filter((item) => item.label === label).length,
        1,
        "Control must be unique: " + label,
      );
      await evaluate(
        `Array.from(document.querySelectorAll('[role="button"],button,a')).find(n=>n.getClientRects().length&&(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)}).click()`,
      );
      await pause(200);
    }
    async function capture(name) {
      const screenshot = await send("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(directory, name + ".png"),
        Buffer.from(screenshot.data, "base64"),
      );
      await observe(name);
    }
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const role of ["customer", "admin"]) {
      await send("Page.navigate", { url: origin + "/sign-in" });
      await wait(
        `document.querySelector('input[aria-label="Email address"]')`,
        "sign-in form",
        300000,
      );
      await fill("Email address", credentials.accounts[role].email);
      await fill("Password", credentials.accounts[role].password);
      await click("Sign in");
      await wait(
        `!location.pathname.includes('sign-in')`,
        "authenticated navigation",
      );
      await observe(role + "-signed-in");
      if (role === "customer" && process.argv.includes("--polish")) {
        await send("Emulation.setDeviceMetricsOverride", {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await wait(
          `!!document.querySelector('[data-testid="photo-loading"]')`,
          "photo skeletons while requests are delayed",
        );
        await capture("polish-home-loading-390");
        delayPhotos = false;
        assert.equal(
          await evaluate(
            `!!document.querySelector('[aria-label="Open Cake City personal assistant"]')`,
          ),
          false,
          "Concierge stays hidden",
        );
        checks.push({ polish: "photo skeletons and hidden concierge" });
      }

      if (role === "admin" && process.argv.includes("--layout")) {
        const shopTab = `document.querySelector('[role="tab"][aria-label="Shop"]')`;
        await wait(`!!(${shopTab})`, "Shop navigation");
        await evaluate(`(${shopTab}).click()`);
        await wait(
          `!!document.querySelector('[data-testid="shop-products"]')`,
          "category-based product grid",
        );
        await click("Choose categories");
        await wait(
          `!!document.querySelector('[role="radio"][aria-label="Vanilla"]')`,
          "category sheet",
        );
        await evaluate(
          `document.querySelector('[role="radio"][aria-label="Vanilla"]').click()`,
        );
        await click("Apply");
        await wait(
          `!!document.querySelector('[aria-label="Choose categories"][aria-selected="true"]')`,
          "category selection applied",
        );
        await click("Choose categories");
        await click("Clear");
        await click("Apply");
        for (const width of [320, 375, 390, 430, 1280]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 600,
          });
          await pause(700);
          const metrics = await evaluate(
            `({viewport:innerWidth, scroll:document.documentElement.scrollWidth, grid:document.querySelector('[data-testid="shop-products"]').getBoundingClientRect().width, active:Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).filter(n=>n.checkVisibility() && ['Home','Shop','Cake City Club','Orders','Profile'].includes(n.getAttribute('aria-label'))).length})`,
          );
          assert.ok(
            metrics.scroll <= metrics.viewport,
            "Shop overflow at " + width,
          );
          assert.ok(
            metrics.grid >= Math.min(width, 800) - 122,
            "Product grid should fit beside the category sidebar",
          );
          assert.equal(
            metrics.active,
            1,
            "Exactly one navigation destination is selected",
          );
          await capture("shop-refined-" + width);
        }
        checks.push({
          layout:
            "category sidebar and product grid, category sheet apply/clear, single selected tab",
          widths: [320, 375, 390, 430, 1280],
        });
      }
      if (role === "admin" && process.argv.includes("--experience")) {
        await send("Emulation.setDeviceMetricsOverride", {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await wait(
          `!!document.querySelector('[aria-label="Make my celebration"]')`,
          "celebration header icon",
        );
        await evaluate(
          `document.querySelector('input[aria-label="Search cakes, flavours and themes"]').focus()`,
        );
        await fill("Search cakes, flavours and themes", "chocolate");
        await wait(
          `document.querySelector('[data-testid="search-predictions"]')?.innerText.includes('Chocolate')`,
          "live Home predictions",
        );
        await capture("experience-home-predictions-390");
        await fill("Search cakes, flavours and themes", "");
        const tab = (label) =>
          `Array.from(document.querySelectorAll('[role="tab"]')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)})`;
        await evaluate(`(${tab("Shop")}).click()`);
        await wait(
          `!!document.querySelector('input[aria-label="Search Cake City"]')`,
          "Shop search",
        );
        await wait(
          `document.body.innerText.includes('Test celebration cake')`,
          "inline test product",
        );
        await capture("experience-shop-390");
        await evaluate(
          `document.querySelector('input[aria-label="Search Cake City"]').focus()`,
        );
        await fill("Search Cake City", "choclate");
        await wait(
          `document.querySelector('[data-testid="search-predictions"]')?.innerText.includes('Chocolate')`,
          "typo-tolerant predictions",
        );
        const prediction = await evaluate(
          `Array.from(document.querySelector('[data-testid="search-predictions"]').querySelectorAll('[role="button"]')).find(n=>n.getAttribute('aria-label')?.startsWith('View '))?.getAttribute('aria-label')`,
        );
        assert.ok(prediction, "A real product prediction must be selectable");
        await click(prediction);
        await wait(
          `location.pathname.startsWith('/product/')`,
          "predictive product navigation",
        );
        // Use the app's back control; CDP Page.goBack is not supported everywhere.
        const back = await evaluate(
          `Array.from(document.querySelectorAll('[role="button"]')).find(n=>/^(Go back|Back)$/.test(n.getAttribute('aria-label')||''))?.getAttribute('aria-label')`,
        );
        if (back) await click(back);
        await wait(`!!(${tab("Cake City Club")})`, "Club tab");
        await evaluate(`(${tab("Cake City Club")}).click()`);
        await wait(
          `!!document.querySelector('[data-testid="club-membership"]') && document.body.innerText.includes('Next chapter:')`,
          "simplified Club",
        );
        for (const width of [320, 390, 430, 1280]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 600,
          });
          await pause(250);
          const size = await evaluate(
            `({viewport:innerWidth,scroll:document.documentElement.scrollWidth})`,
          );
          assert.ok(size.scroll <= size.viewport, "Club overflow at " + width);
          await capture("experience-club-" + width);
        }
        checks.push({
          experience:
            "predictive Home and Shop, typo correction, product navigation, inline staff test cake, simplified Club",
          widths: [320, 390, 430, 1280],
        });
      }
      // Use the app navigation so browser memory-only auth is preserved.
      const navigation = await evaluate(
        `Array.from(document.querySelectorAll('[aria-label]')).filter(n=>/account/i.test(n.getAttribute('aria-label'))).map(n=>({label:n.getAttribute('aria-label'),role:n.getAttribute('role')}))`,
      );
      fs.writeFileSync(
        path.join(directory, role + "-navigation.json"),
        JSON.stringify(navigation, null, 2),
      );
      const accountControl = navigation.find((item) =>
        ["button", "link", "tab"].includes(item.role),
      );
      if (!accountControl)
        throw new Error(
          "Account navigation unavailable; inspect " +
            role +
            "-navigation.json",
        );
      await evaluate(
        `Array.from(document.querySelectorAll('[aria-label]')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(accountControl.label)}&&['button','link','tab'].includes(n.getAttribute('role'))).click()`,
      );
      await wait(`location.pathname.includes('account')`, "Account route");
      await observe(role + "-account");
      if (role === "customer" && process.argv.includes("--profile")) {
        const accountSession = await (
          await fetch(apiOrigin + "/v1/auth/mobile/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials.accounts.customer),
          })
        ).json();
        const headers = {
          Authorization: "Bearer " + accountSession.access_token,
        };
        const original = accountSession.customer;
        await click("Profile settings");
        await wait(
          `!!document.querySelector('[data-testid="profile-details-form"]')`,
          "editable profile",
        );
        await fill("First name", "Local Updated");
        await fill("Contact phone (optional)", "invalid");
        await click("Save details");
        await wait(
          `document.body.innerText.includes('Enter a Kenyan phone number')`,
          "inline contact validation",
        );
        assert.equal(
          (
            await (
              await fetch(apiOrigin + "/v1/account/profile", { headers })
            ).json()
          ).first_name,
          original.first_name,
        );
        await fill("Contact phone (optional)", "+254 712 345 678");
        await click("Save details");
        await wait(
          `document.body.innerText.includes('Your details have been saved.')`,
          "profile saved",
        );
        const saved = await (
          await fetch(apiOrigin + "/v1/account/profile", { headers })
        ).json();
        assert.equal(saved.first_name, "Local Updated");
        assert.equal(saved.phone, "+254712345678");
        assert.equal(saved.email, original.email);
        await fill("First name", "Unsaved name");
        await click("Discard changes");
        assert.equal(
          await evaluate(
            `document.querySelector('input[aria-label="First name"]').value`,
          ),
          "Local Updated",
        );
        for (const width of [320, 390, 430]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: true,
          });
          await evaluate(
            `document.querySelector('[data-testid="profile-details-form"]').scrollIntoView({block:'center'})`,
          );
          await pause(250);
          const sizes = await evaluate(
            `({viewport:innerWidth,scroll:document.documentElement.scrollWidth})`,
          );
          assert.ok(
            sizes.scroll <= sizes.viewport,
            "Profile overflow at " + width,
          );
          await capture("profile-edit-" + width);
        }
        await fill("First name", original.first_name);
        await fill("Last name", original.last_name);
        await fill("Contact phone (optional)", original.phone || "");
        await click("Save details");
        await wait(
          `document.body.innerText.includes('Your details have been saved.')`,
          "review profile restored",
        );
        await click("Profile settings");
        checks.push({
          profile:
            "real self-service save, validation, normalized phone, discard, persisted API read and original restored",
          widths: [320, 390, 430],
        });
      }
      if (role === "customer" && process.argv.includes("--privacy")) {
        await click("Privacy & account");
        await wait(
          `document.body.innerText.includes('Download my account data')`,
          "account privacy",
        );
        await click("Download my account data");
        await wait(
          `document.body.innerText.includes('Your account export is ready')`,
          "private account export",
        );
        await click("Delete my account");
        await wait(
          `!!document.querySelector('input[aria-label="Current password"]')`,
          "password-confirmed closure",
        );
        assert.equal(
          await evaluate(
            `document.querySelector('[aria-label="Permanently delete my account"]').getAttribute('aria-disabled')`,
          ),
          "true",
        );
        for (const width of [320, 390, 430]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: true,
          });
          assert.ok(
            await evaluate(
              `document.documentElement.scrollWidth <= innerWidth`,
            ),
            "Privacy screen overflow",
          );
          await capture("account-privacy-" + width);
        }
        await click("Contact privacy support");
        await wait(
          `!!document.querySelector('textarea[aria-label="Request details"]')`,
          "privacy support request",
        );
        await fill("Subject", "Local account privacy acceptance");
        await click("Send request");
        await wait(
          `document.body.innerText.includes('Local account privacy acceptance') && !document.querySelector('[aria-label="Subject"]')?.value`,
          "persisted support request",
        );
        await capture("account-privacy-support-390");
        checks.push({
          privacy: "private export, deletion confirmation, support submission",
          widths: [320, 390, 430],
          accountNotDeleted: true,
        });
        const account = `Array.from(document.querySelectorAll('[aria-label]')).find(n=>/^(Profile|Account)$/.test(n.getAttribute('aria-label')) && ['button','tab','link'].includes(n.getAttribute('role')))`;
        await evaluate(`(${account}).click()`);
        await wait(
          `location.pathname.includes('account')`,
          "return to account",
        );
      }
      if (role === "customer") {
        await click("Cake City for business");
        await wait(
          `document.body.innerText.includes('Register your company')`,
          "corporate workspace",
        );
        await capture("corporate-preview");
      } else {
        if (process.argv.includes("--checkout")) {
          const shopTab = `Array.from(document.querySelectorAll('[role="tab"]')).find(n=>n.getAttribute('aria-label')==='Shop')`;
          await wait(`!!(${shopTab})`, "Shop tab");
          await evaluate(`(${shopTab}).click()`);
          await wait(`location.pathname.includes('shop')`, "Shop route");
          const clearSearch = await evaluate(
            `Array.from(document.querySelectorAll('[role="button"]')).find(n=>n.getClientRects().length && n.getAttribute('aria-label')==='Clear search')?.getAttribute('aria-label')`,
          );
          if (clearSearch) await click(clearSearch);
          await wait(
            `!!document.querySelector('[aria-label="Test celebration cake, KES 1, simulation only, no charge"]')`,
            "test product in All cakes",
          );
          await click(
            "Test celebration cake, KES 1, simulation only, no charge",
          );
          await wait(
            "document.body.innerText.includes('Celebration cake') && location.pathname === '/payment-test'",
            "visible test product",
          );
          for (const width of [320, 390, 1280]) {
            await send("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: width < 600,
            });
            const size = await evaluate(
              "({viewport:innerWidth,scroll:document.documentElement.scrollWidth})",
            );
            assert.ok(
              size.scroll <= size.viewport,
              "Test checkout overflow at " + width,
            );
            await capture("test-checkout-" + width);
          }
          await fill("Phone", "0712345678");
          await fill("Delivery address", "Westlands test building, reception");
          await click("Review order");
          await wait(
            "document.body.innerText.includes('Actual charge: KES 0.00')",
            "test review before confirmation",
          );
          await capture("test-checkout-review");
          await click("Confirm preview purchase");
          await wait(
            "document.body.innerText.includes('Order confirmed:')",
            "test checkout confirmed",
          );
          checkoutReference = await evaluate(
            "document.body.innerText.match(/Order confirmed: (APP-[A-Z0-9-]+)/)[1]",
          );
          await capture("test-checkout-confirmed");
          if (process.argv.includes("--club")) {
            await wait(
              "document.body.innerText.includes('Your first points!')",
              "first-points celebration",
            );
            await wait(
              "!!document.querySelector('[data-testid=\"milestone-confetti\"]')",
              "first-points confetti burst",
            );
            await capture("club-first-points-confetti");
            await click("Reveal my Club card");
            await wait(
              "!!document.querySelector('[data-testid=\"club-journey\"]')",
              "Club card and milestone journey",
            );
            for (const width of [320, 390, 1280]) {
              await send("Emulation.setDeviceMetricsOverride", {
                width,
                height: 900,
                deviceScaleFactor: 1,
                mobile: width < 600,
              });
              await pause(250);
              const size = await evaluate(
                "({viewport:innerWidth,scroll:document.documentElement.scrollWidth})",
              );
              assert.ok(
                size.scroll <= size.viewport,
                "Club overflow at " + width,
              );
              await capture("club-updated-" + width);
            }
            checks.push({
              club: "verified first points, confetti, acknowledged card reveal and responsive journey",
              reference: checkoutReference,
            });
            continue;
          }
          await click("Track my order");
          await wait(
            "document.body.innerText.includes(" +
              JSON.stringify(checkoutReference) +
              ")",
            "test order tracking",
          );
          await capture("test-order-tracking");
          checks.push({
            checkout: "visible test cake, review, simulation and tracking",
            reference: checkoutReference,
            noCharge: true,
            widths: [320, 390, 1280],
          });
          continue;
        }
        await click("Command Center");
        await wait(
          `document.body.innerText.includes('Requests and quotations')`,
          "Command Center workspace",
        );
        await wait(
          `!document.body.innerText.includes('Loading recorded requests')`,
          "request queue response",
        );
        await capture("command-center-preview");
      }
      checks.push({ account: role, authenticated_workspace: true });
    }
    if (process.argv.includes("--logistics")) {
      const localCall = async (path, token, body, method) => {
        const response = await fetch(apiOrigin + path, {
          method: method ?? (body === undefined ? "GET" : "POST"),
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const result = await response.json();
        assert.ok(response.ok, path + ": " + JSON.stringify(result));
        return result;
      };
      const sessions = {};
      for (const role of ["admin", "production", "rider"]) {
        sessions[role] = await localCall(
          "/v1/auth/mobile/login",
          null,
          credentials.accounts[role],
        );
      }
      const adminToken = sessions.admin.access_token;
      let order;
      if (checkoutReference) {
        order = await localCall(
          "/v1/app-orders/" + checkoutReference,
          adminToken,
        );
      } else {
        const product = await localCall(
          "/v1/admin/payment-test/product",
          adminToken,
          {},
        );
        const quote = await localCall("/v1/app-checkout/quote", adminToken, {
          items: [{ product_id: product.id, quantity: 1 }],
          fulfilment: "delivery",
          billing: {
            first_name: "Local",
            last_name: "Logistics",
            email: "local@example.com",
            phone: "0712345678",
            address: "Local review destination",
          },
        });
        const placed = await fetch(apiOrigin + "/v1/app-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + adminToken,
            "Idempotency-Key": "local-logistics-" + Date.now(),
          },
          body: JSON.stringify({ quote_id: quote.id }),
        });
        assert.ok(placed.ok);
        order = await placed.json();
        await localCall(
          `/v1/admin/payment-test/orders/${order.reference}/complete`,
          adminToken,
          {},
        );
      }
      const signIn = async (role, route) => {
        await send("Page.navigate", {
          url: origin + "/" + (role === "rider" ? "rider-login" : "sign-in"),
        });
        await wait(
          `document.querySelector('input[aria-label="Email address"]')`,
          "team login",
        );
        await fill("Email address", credentials.accounts[role].email);
        await fill("Password", credentials.accounts[role].password);
        await click("Sign in");
        await wait(
          `!location.pathname.includes('sign-in') && !location.pathname.includes('rider-login')`,
          "team authenticated",
        );
        if (route !== "/rider") {
          // Browser authentication is intentionally held in memory. Navigate
          // through real app controls rather than reloading the JS session.
          const account = `Array.from(document.querySelectorAll('[aria-label]')).find(n=>/account/i.test(n.getAttribute('aria-label'))&&['button','link','tab'].includes(n.getAttribute('role')))`;
          await wait(`!!(${account})`, "Account navigation");
          await evaluate(`(${account}).click()`);
          await wait(`location.pathname.includes('account')`, "Account route");
          await click(
            route === "/kitchen"
              ? "Kitchen"
              : route === "/notifications"
                ? "Notifications"
                : "Dispatch",
          );
        }
      };
      const workSelector = `[data-testid="work-${order.reference}"]`;
      const scopedClick = async (selector, label) => {
        const expression = `Array.from(document.querySelector(${JSON.stringify(selector)})?.querySelectorAll('[role="button"],button')||[]).find(n=>(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)})`;
        await wait(
          `!!(${expression}) && (${expression}).getAttribute('aria-disabled') !== 'true' && !(${expression}).disabled`,
          label,
        );
        await evaluate(`(${expression}).click()`);
        await pause(300);
      };
      await send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 900,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await signIn("production", "/kitchen");
      await wait(
        "document.body.innerText.includes('Sign out of team workspace')",
        "current team build",
      );
      await wait(
        `!!document.querySelector(${JSON.stringify(workSelector)})`,
        "paid kitchen task",
      );
      await scopedClick(workSelector, "Head Office");
      await scopedClick(workSelector, "Assign production to me");
      await scopedClick(workSelector, "Start preparing");
      await scopedClick(
        workSelector,
        "Kitchen complete \u2014 ready for dispatch",
      );
      await wait(
        `document.querySelector(${JSON.stringify(workSelector)}).innerText.includes('ready')`,
        "kitchen ready",
      );
      await capture("kitchen-ready-390");
      await signIn("admin", "/dispatch");
      await wait(
        `!!document.querySelector(${JSON.stringify(workSelector)})`,
        "dispatch task",
      );
      await scopedClick(workSelector, "Local Reviewer");
      await scopedClick(workSelector, "Assign remaining order items");
      const tasks = await localCall(
        "/v1/rider/tasks",
        sessions.rider.access_token,
      );
      const trip = tasks.find((task) => task.reference === order.reference);
      assert.ok(trip, "Assignment must arrive in the rider API");
      await capture("dispatch-assigned-390");
      await signIn("rider", "/rider");
      await wait(
        "document.body.innerText.includes('Sign out of rider workspace')",
        "current rider build",
      );
      const tripSelector = `[data-testid="trip-${trip.id}"]`;
      for (const label of [
        "Accept assignment",
        "Confirm collection",
        "Start delivery",
      ])
        await scopedClick(tripSelector, label);
      await wait(
        `document.querySelector('input[aria-label="Delivery confirmation"]')`,
        "delivery confirmation input",
      );
      if (process.argv.includes("--live-tracking")) {
        await send("Browser.grantPermissions", {
          origin,
          permissions: ["geolocation"],
        });
        await send("Emulation.setGeolocationOverride", {
          latitude: -1.267,
          longitude: 36.81,
          accuracy: 12,
        });
        await scopedClick(tripSelector, "Share live delivery location");
        await wait(
          `document.querySelector(${JSON.stringify(tripSelector)}).innerText.includes('Location shared at')`,
          "rider GPS reaches backend",
        );
        const shared = await localCall(
          "/v1/app-orders/" + order.reference,
          adminToken,
        );
        assert.equal(
          shared.deliveries.find((t) => t.id === trip.id).position.latitude,
          -1.267,
        );
        await capture("tracking-rider-sharing-390");
        await signIn("admin", "/notifications");
        // The rider page stops sharing on logout. Use explicit local fixture fixes
        // to exercise a second customer session without operating a real device.
        const locationPath = `/v1/rider/tasks/${trip.id}/location`;
        await localCall(
          locationPath,
          sessions.rider.access_token,
          {
            latitude: -1.267,
            longitude: 36.81,
            accuracy: 12,
            recorded_at: new Date().toISOString(),
          },
          "PUT",
        );
        const alerts = await localCall("/v1/account/notifications", adminToken);
        const alert = alerts.find(
          (item) =>
            item.data.reference === order.reference &&
            item.kind === "fulfilment_out_for_delivery",
        );
        assert.ok(alert, "Out-for-delivery notification");
        const alertButton = `Array.from(document.querySelectorAll('[role="button"]')).filter(n=>n.getAttribute('aria-label')==='View order').find(n=>n.parentElement.innerText.includes(${JSON.stringify(alert.title)}))`;
        await wait(`!!(${alertButton})`, "delivery alert");
        await evaluate(`(${alertButton}).click()`);
        await wait(
          `document.body.innerText.includes('Follow your delivery') && !!document.querySelector('iframe[title="Live delivery map"]')`,
          "customer live map",
        );
        let mapTarget;
        for (let attempt = 0; attempt < 40 && !mapTarget; attempt++) {
          const { targetInfos } = await send("Target.getTargets");
          mapTarget = targetInfos.find(
            (target) =>
              target.type === "iframe" &&
              target.url.includes("/v1/delivery-tracking/map"),
          );
          if (!mapTarget) await pause(250);
        }
        await capture("tracking-map-loading-390");
        assert.ok(mapTarget, "Map frame loaded");
        const mapSession = await send("Target.attachToTarget", {
          targetId: mapTarget.targetId,
          flatten: true,
        });
        let marker;
        for (let attempt = 0; attempt < 60; attempt++) {
          marker = await send(
            "Runtime.evaluate",
            {
              expression: `!!document.querySelector('.rider')`,
              returnByValue: true,
            },
            mapSession.sessionId,
          );
          if (marker.result.value) break;
          await pause(250);
        }
        assert.equal(marker.result.value, true, "Real map marker rendered");
        await pause(3500);
        for (const width of [320, 390, 430, 1280]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 600,
          });
          await pause(900);
          const size = await evaluate(
            `({viewport:innerWidth,scroll:document.documentElement.scrollWidth})`,
          );
          assert.ok(
            size.scroll <= size.viewport,
            "Tracking overflow at " + width,
          );
          await capture("tracking-live-" + width);
        }
        await localCall(
          locationPath,
          sessions.rider.access_token,
          {
            latitude: -1.268,
            longitude: 36.812,
            accuracy: 12,
            recorded_at: new Date().toISOString(),
          },
          "PUT",
        );
        await click("Refresh tracking");
        await wait(
          `document.body.innerText.includes('Location updated')`,
          "updated GPS fix",
        );
        await capture("tracking-live-updated-390");
        await signIn("rider", "/rider");
        await wait(
          `!!document.querySelector('input[aria-label="Delivery confirmation"]')`,
          "return to rider confirmation",
        );
        checks.push({
          liveTracking:
            "rider browser GPS, private backend, customer map marker, second location fix",
          syntheticCoordinates: true,
          widths: [320, 390, 430, 1280],
        });
      }
      await fill(
        "Delivery confirmation",
        "Local recipient confirmed receipt (simulation)",
        tripSelector,
      );
      await scopedClick(tripSelector, "Confirm delivery");
      await click("Completed deliveries");
      await wait(
        `document.querySelector(${JSON.stringify(tripSelector)}).innerText.includes('delivered')`,
        "delivered trip",
      );
      await capture("rider-delivered-390");
      const finalOrder = await localCall(
        "/v1/app-orders/" + order.reference,
        adminToken,
      );
      assert.equal(finalOrder.status, "completed");
      assert.equal(
        finalOrder.deliveries.find((task) => task.id === trip.id).status,
        "delivered",
      );
      checks.push({
        lifecycle: "independent kitchen-dispatch-rider",
        reference: order.reference,
        simulated: true,
        riderSignIn: true,
        readyBeforeCollection: true,
        customerOrderCompleted: true,
      });
      if (process.argv.includes("--dashboard")) {
        const product = await localCall(
          "/v1/admin/payment-test/product",
          adminToken,
          {},
        );
        const quote = await localCall("/v1/app-checkout/quote", adminToken, {
          items: [{ product_id: product.id, quantity: 1 }],
          fulfilment: "delivery",
          billing: {
            first_name: "Local",
            last_name: "Dashboard",
            email: "local@example.com",
            phone: "0712345678",
            address: "Local dashboard destination",
          },
        });
        const response = await fetch(apiOrigin + "/v1/app-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + adminToken,
            "Idempotency-Key": "local-dashboard-" + Date.now(),
          },
          body: JSON.stringify({ quote_id: quote.id }),
        });
        assert.ok(response.ok);
        const dashboardOrder = await response.json();
        const reference = dashboardOrder.reference;
        await localCall(
          `/v1/admin/payment-test/orders/${reference}/complete`,
          adminToken,
          {},
        );
        await send("Page.navigate", { url: apiOrigin + "/admin" });
        await wait(
          `typeof document.querySelector('#signin')?.onsubmit === 'function'`,
          "dashboard login",
        );
        // Use the native setter so this remains a real form submission.
        await evaluate(
          `document.querySelector('#signin input[name="email"]').value=${JSON.stringify(credentials.accounts.admin.email)};document.querySelector('#signin input[name="password"]').value=${JSON.stringify(credentials.accounts.admin.password)};document.querySelector('#signin').requestSubmit(document.querySelector('#signin button'))`,
        );
        await wait(
          `!document.querySelector('#workspace').hidden`,
          "dashboard authenticated",
        );
        const press = async (selector) => {
          await wait(
            `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,
            "dashboard control " + selector,
          );
          await evaluate(
            `document.querySelector(${JSON.stringify(selector)}).click()`,
          );
        };
        const saved = () =>
          wait(
            `!document.querySelector('#editor').open`,
            "dashboard form saved",
          );
        await press('[data-nav="kitchen"]');
        await press(`[data-kitchen-assign="${reference}"]`);
        await wait(
          `document.querySelector('#editor').open`,
          "production location dialog",
        );
        await press("#save");
        await saved();
        await press(
          `[data-kitchen-order="${reference}"][data-status="preparing"]`,
        );
        await press(`[data-kitchen-order="${reference}"][data-status="ready"]`);
        await wait(
          `document.querySelector('[data-work="${reference}"]').innerText.includes('ready')`,
          "dashboard kitchen ready",
        );
        await press('[data-nav="dispatch"]');
        await press(`[data-assign="${reference}"]`);
        await wait(
          `document.querySelector('#editor').open`,
          "rider account dialog",
        );
        await evaluate(
          `document.querySelector('#fields select').value=${JSON.stringify(sessions.rider.customer.id)}`,
        );
        await press("#save");
        await saved();
        const assigned = (
          await localCall("/v1/rider/tasks", sessions.rider.access_token)
        ).find((t) => t.reference === reference);
        assert.ok(
          assigned,
          "Dashboard assignment must create a task in the rider's login",
        );
        for (const status of ["accepted", "collected", "in_transit"])
          await press(`[data-trip="${assigned.id}"][data-status="${status}"]`);
        await press(`[data-trip="${assigned.id}"][data-status="delivered"]`);
        await wait(
          `document.querySelector('#editor').open`,
          "delivery proof dialog",
        );
        await evaluate(
          `document.querySelector('#fields input[name="proof"]').value='Local dashboard recipient confirmed receipt';`,
        );
        await press("#save");
        await saved();
        assert.equal(
          (await localCall("/v1/app-orders/" + reference, adminToken)).status,
          "completed",
        );
        for (const width of [390, 1280]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 600,
          });
          await capture("dashboard-dispatch-" + width);
        }
        checks.push({
          dashboard:
            "real production assignment, rider-account task, handover, transit, delivery proof",
          reference,
          simulated: true,
        });
      }
      if (process.argv.includes("--notifications")) {
        await signIn("admin", "/notifications");
        await wait(
          "document.body.innerText.includes('Your order updates, all in one place.')",
          "notification inbox",
        );
        const inboxItems = await localCall(
          "/v1/account/notifications",
          adminToken,
        );
        const completedAlert = inboxItems.find(
          (item) =>
            item.data.reference === order.reference &&
            item.kind === "fulfilment_completed",
        );
        assert.ok(
          completedAlert,
          "Completed delivery must appear in the customer's inbox",
        );
        await capture("notification-inbox-390");
        const cardButton = `document.querySelector(${JSON.stringify(`[data-testid="notification-${completedAlert.id}"] [aria-label="View order"]`)})`;
        await wait(`!!(${cardButton})`, "completed notification card");
        await evaluate(`(${cardButton}).click()`);
        await wait(
          `location.pathname.includes(${JSON.stringify(order.reference)}) && document.body.innerText.includes('Test journey complete!')`,
          "completed-order confirmation",
        );
        await wait(
          `!!document.querySelector('[aria-label="Rate 5 stars"]')`,
          "feedback form loaded",
        );
        await click("Rate 5 stars");
        await fill(
          "Tell us more (optional)",
          "Verified local end-to-end delivery feedback.",
        );
        await click("Send feedback");
        await wait(
          "document.body.innerText.includes('Thank you for your feedback')",
          "saved review confirmation",
        );
        const savedReview = await localCall(
          "/v1/app-orders/" + order.reference + "/review",
          adminToken,
        );
        assert.equal(savedReview.rating, 5);
        assert.equal(savedReview.simulated, true);
        for (const width of [320, 390, 1280]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 600,
          });
          const size = await evaluate(
            "({viewport:innerWidth,scroll:document.documentElement.scrollWidth})",
          );
          assert.ok(
            size.scroll <= size.viewport,
            "Delivered order overflow at " + width,
          );
          await capture("delivery-complete-" + width);
        }
        checks.push({
          notifications:
            "inbox, order deep link, delivery confirmation and persisted review",
          reference: order.reference,
          noRemotePush: true,
        });
      }
      if (
        process.argv.includes("--experience") &&
        process.argv.includes("--notifications")
      ) {
        const product = await localCall(
          "/v1/admin/payment-test/product",
          adminToken,
          {},
        );
        const quote = await localCall("/v1/app-checkout/quote", adminToken, {
          items: [{ product_id: product.id, quantity: 1 }],
          fulfilment: "pickup",
          billing: {
            first_name: "Local",
            last_name: "Pickup",
            email: "local@example.com",
            phone: "0712345678",
            address: "HQ local pickup",
          },
        });
        const placed = await fetch(apiOrigin + "/v1/app-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + adminToken,
            "Idempotency-Key": "local-pickup-" + Date.now(),
          },
          body: JSON.stringify({ quote_id: quote.id }),
        });
        assert.ok(placed.ok);
        const pickup = await placed.json();
        await localCall(
          `/v1/admin/payment-test/orders/${pickup.reference}/complete`,
          adminToken,
          {},
        );
        await localCall(
          `/v1/kitchen/orders/${pickup.reference}/assignment`,
          adminToken,
          { plant: "hq", assigned_to: sessions.admin.customer.id },
          "PUT",
        );
        for (const status of ["preparing", "ready"])
          await localCall(
            `/v1/kitchen/orders/${pickup.reference}/status`,
            adminToken,
            { status },
            "PATCH",
          );
        const bannerSelector = `[role="button"][aria-label$="View update"]`;
        await wait(
          `document.querySelector(${JSON.stringify(bannerSelector)})?.innerText.includes('ready for collection')`,
          "foreground kitchen-ready alert",
          30000,
        );
        await capture("experience-ready-notification-390");
        await evaluate(
          `document.querySelector(${JSON.stringify(bannerSelector)}).click()`,
        );
        await wait(
          `location.pathname.includes(${JSON.stringify(pickup.reference)}) && document.body.innerText.includes('Ready for pickup')`,
          "notification opens matching tracking",
        );
        await capture("experience-ready-tracking-390");
        await signIn("admin", "/dispatch");
        const pickupWork = `[data-testid="work-${pickup.reference}"]`;
        await scopedClick(pickupWork, "Confirm customer collected");
        await wait(
          `!document.querySelector(${JSON.stringify(pickupWork)})?.innerText.includes('Confirm customer collected')`,
          "customer collection saved",
        );
        const result = await localCall(
          "/v1/app-orders/" + pickup.reference,
          adminToken,
        );
        assert.equal(result.status, "completed");
        checks.push({
          foregroundReadinessAlert: true,
          alertOpensMatchingOrder: true,
          pickupDispatchHandover: true,
          reference: pickup.reference,
          noRemotePush: true,
        });
      }
    }
    if (process.argv.includes("--commerce")) {
      const products = await (
        await fetch(apiOrigin + "/v1/catalogue/products?per_page=1")
      ).json();
      assert.ok(
        products.length,
        "Import the catalogue into the local preview before the commerce check.",
      );
      for (const width of [390, 1280]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 600,
        });
        for (const [name, route] of [
          ["home", "/"],
          ["shop", "/shop"],
          ["product", "/product/" + products[0].id],
        ]) {
          await send("Page.navigate", { url: origin + route });
          await wait(
            "document.querySelector('[role=\"button\"],button,a') && document.body.innerText.length > 150",
            name + " loaded",
            180000,
          );
          if (name === "product")
            await wait(
              `document.body.innerText.includes(${JSON.stringify(products[0].name)})`,
              "imported product",
            );
          if (name === "shop")
            await wait(
              "document.querySelector('input[aria-label=\"Search Cake City\"]')",
              "catalogue search",
            );
          await pause(1200);
          const size = await evaluate(
            "({viewport:innerWidth,scroll:document.documentElement.scrollWidth})",
          );
          assert.ok(
            size.scroll <= size.viewport,
            "Horizontal overflow on " + name + " at " + width,
          );
          await capture(name + "-" + width);
          checks.push({ screen: name, width, horizontalOverflow: false });
        }
      }
    }
    if (process.argv.includes("--splash")) {
      await send("Page.navigate", { url: origin + "/splash-preview" });
      await wait(
        "document.body.innerText.includes('EVERY MOMENT DESERVES')",
        "branded splash preview",
      );
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [430, 932],
        [1280, 900],
      ]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: width < 600,
        });
        await pause(250);
        const size = await evaluate(
          "({viewport:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight})",
        );
        assert.ok(size.scroll <= size.viewport, "Splash overflow at " + width);
        assert.ok(
          size.scrollHeight <= size.height,
          "Splash vertical overflow at " + width,
        );
        await capture("splash-" + width);
        checks.push({
          splash: "real app artwork preview",
          width,
          height,
          overflow: false,
        });
      }
    }
    assert.deepEqual(errors, [], "Unexpected runtime failures/external writes");
    const localTimings = await evaluate(
      `performance.getEntriesByType('resource').filter(r=>r.name.startsWith(${JSON.stringify(apiOrigin)}) && r.duration>0).map(r=>({path:new URL(r.name).pathname, ms:Math.round(r.duration)}))`,
    );
    const durations = localTimings.map((r) => r.ms).sort((a, b) => a - b);
    fs.writeFileSync(
      path.join(directory, "browser-performance.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          source: "local development browser; not a native release benchmark",
          samples: durations.length,
          median_ms: durations[Math.floor(durations.length / 2)] ?? null,
          p95_ms:
            durations[
              Math.min(
                durations.length - 1,
                Math.floor(durations.length * 0.95),
              )
            ] ?? null,
          requests: localTimings,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(directory, "browser-verification.json"),
      JSON.stringify(
        {
          passed: true,
          checks,
          errors,
          source: "real local API and browser",
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      "Browser verification passed: local sign-in, corporate workspace and Command Center. Screenshots saved in artifacts/local-preview/.\n",
    );
  } finally {
    if (send && socket?.readyState === WebSocket.OPEN) {
      try {
        await Promise.race([send("Browser.close"), pause(1500)]);
      } catch {}
      socket.close();
    }
    child.kill();
  }
}
main().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
