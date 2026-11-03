// Real local UI/API verification. Synthetic purchases only; external writes blocked.
require("../tests/register.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { receiptHtml } = require("../src/features/purchase-test/receipt.ts");
const directory = path.resolve(__dirname, "../artifacts/purchase-test");
const running = JSON.parse(
  fs.readFileSync(
    process.argv[2] || path.join(directory, "RUNNING.json"),
    "utf8",
  ),
);
const previewUrl = new URL(running.webUrl);
assert.equal(
  previewUrl.hostname,
  "localhost",
  "Review UI must stay on localhost",
);
const origin = previewUrl.origin;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const settings = JSON.parse(
    fs.readFileSync(path.join(directory, "private-settings.json"), "utf8"),
  );
  const localOrigins = [
    origin,
    running.apiUrl || `http://${running.host}:8011`,
  ];
  const browser = [
    path.join(
      process.env.PROGRAMFILES || "",
      "Google/Chrome/Application/chrome.exe",
    ),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Microsoft/Edge/Application/msedge.exe",
    ),
  ].find(fs.existsSync);
  assert.ok(
    browser,
    "Chrome or Edge is required for local browser verification",
  );
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "cakecity-purchase-browser-"),
  );
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--remote-debugging-port=9351",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "--disable-sync",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let socket, send, captureFailure;
  const receipts = new Map();
  const errors = [],
    checks = [];
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      try {
        target = (
          await (await fetch("http://127.0.0.1:9351/json/list")).json()
        ).find((tab) => tab.type === "page");
      } catch {}
      if (!target) await pause(250);
    }
    assert.ok(target, "Disposable browser did not start");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence,
          timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error("Browser timeout: " + method));
          }, 30000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) return;
        clearTimeout(item.timeout);
        pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown")
        errors.push(
          message.params.exceptionDetails.exception?.description ||
            message.params.exceptionDetails.text,
        );
      if (message.method === "Fetch.requestPaused") {
        const request = message.params.request,
          url = new URL(request.url);
        const allowed =
          localOrigins.includes(url.origin) ||
          ["GET", "OPTIONS"].includes(request.method);
        if (!allowed)
          errors.push("Blocked external write: " + url.origin + url.pathname);
        void send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", {
          requestId: message.params.requestId,
          ...(allowed ? {} : { errorReason: "BlockedByClient" }),
        }).catch(() => {});
      }
      if (
        message.method === "Network.responseReceived" &&
        /\/v1\/test-checkout\/purchases\/TEST-[^/]+\/receipt$/.test(
          message.params.response.url,
        )
      ) {
        const requestId = message.params.requestId;
        // Read the actual receipt response after its download finishes.
        const handler = async (finish) => {
          const item = JSON.parse(finish.data);
          if (
            item.method !== "Network.loadingFinished" ||
            item.params.requestId !== requestId
          )
            return;
          socket.removeEventListener("message", handler);
          try {
            const result = await send("Network.getResponseBody", { requestId });
            const receipt = JSON.parse(result.body);
            if (receipt.id) receipts.set(receipt.id, receipt);
          } catch {}
        };
        socket.addEventListener("message", handler);
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
      const result = await evaluate(
        `({url:location.pathname,text:document.body.innerText.slice(0,14000),controls:Array.from(document.querySelectorAll('[role="button"],[role="tab"],button,a,input,textarea')).filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label')||n.innerText?.trim(),role:n.getAttribute('role')||n.tagName.toLowerCase(),value:/password|access code/i.test((n.getAttribute('aria-label')||'')+' '+n.type)?'[private]':n.value}))})`,
      );
      fs.writeFileSync(
        path.join(directory, name + ".json"),
        JSON.stringify(result, null, 2),
      );
      return result;
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
      throw new Error("Missing UI state: " + label);
    }
    async function fill(label, value) {
      const state = await observe("browser-latest");
      assert.equal(
        state.controls.filter(
          (item) =>
            item.label === label &&
            ["input", "textarea", "textbox"].includes(item.role),
        ).length,
        1,
        "Unique input: " + label,
      );
      await evaluate(
        `(()=>{const n=Array.from(document.querySelectorAll('input,textarea')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)});Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await pause(150);
    }
    async function click(label) {
      const state = await observe("browser-latest");
      assert.equal(
        state.controls.filter(
          (item) =>
            item.label === label &&
            ["button", "a", "link", "tab"].includes(item.role),
        ).length,
        1,
        "Unique button: " + label,
      );
      await evaluate(
        `(()=>{const n=Array.from(document.querySelectorAll('[role="button"],[role="tab"],button,a')).find(n=>n.getClientRects().length&&(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)});n.scrollIntoView({block:'center'});})()`,
      );
      await pause(100);
      const point = await evaluate(
        `(()=>{const n=Array.from(document.querySelectorAll('[role="button"],[role="tab"],button,a')).find(n=>n.getClientRects().length&&(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)});const r=n.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x:x-(visualViewport?.offsetLeft||0),y:y-(visualViewport?.offsetTop||0),uncovered:n.contains(document.elementFromPoint(x,y))};})()`,
      );
      assert.equal(
        point.uncovered,
        true,
        "Button is visible and not covered: " + label,
      );
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: point.x, y: point.y }],
      });
      await pause(60);
      await send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await pause(200);
    }
    async function screenshot(name) {
      const result = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, name + ".png"),
        Buffer.from(result.data, "base64"),
      );
      await observe(name);
    }
    captureFailure = () => screenshot("browser-failure");
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url: origin + "/checkout" });
    await wait(
      `document.querySelector('input[aria-label="Access code"]')`,
      "membership connection",
      180000,
    );
    await fill("Access code", settings.code);
    await click("Connect membership");
    await wait(
      `document.body.innerText.includes('Earn +25 Club points')`,
      "checkout ready",
    );
    if (
      !(await evaluate(
        `Boolean(document.querySelector('input[aria-label="Full name"]'))`,
      ))
    )
      await click("Billing details");
    await fill("Full name", "Cake City Review Customer");
    await fill("Billing email", "buyer@example.com");
    await fill("Billing address", "Collection, Nairobi");
    await screenshot("checkout-clean");
    assert.equal(
      await evaluate(
        `document.body.innerText.includes('TEST PURCHASE') || document.body.innerText.includes('YOUR TEST MEMBERSHIP')`,
      ),
      false,
    );
    let firstReceipt;
    const tiers = ["Bronze", "Silver", "Silver", "Gold", "Diamond", "Platinum"];
    for (let number = 1; number <= tiers.length; number++) {
      await click("Pay KSh 100");
      await wait(
        `document.querySelector('[data-testid="purchase-confirmation"]') && document.body.innerText.includes('${number * 25} points at purchase')`,
        "payment and receipt " + number,
      );
      const expected = tiers[number - 1];
      const latestId = await evaluate(`location.pathname.split('/').at(-1)`);
      for (let attempt = 0; attempt < 100 && !receipts.has(latestId); attempt++)
        await pause(50);
      const receipt = receipts.get(latestId);
      assert.ok(receipt?.id, "Actual saved receipt response captured");
      assert.equal(receipt.membership_at_purchase.points, number * 25);
      assert.equal(receipt.membership_at_purchase.tier, expected);
      if (!firstReceipt) firstReceipt = receipt;
      const milestone = [2, 4, 5, 6].includes(number);
      if (milestone) {
        await wait(
          `document.querySelector('[data-testid="milestone-prompt"]')?.textContent.includes('${expected} unlocked!')`,
          "new milestone prompt",
        );
        await wait(
          `document.querySelector('[data-testid="milestone-confetti"]')`,
          "side confetti",
        );
        await pause(250);
        assert.equal(
          await evaluate(
            `innerWidth===390 && innerHeight===844 && document.documentElement.scrollWidth<=390 && document.documentElement.scrollHeight<=844`,
          ),
          true,
          "Confetti stays inside the viewport without moving the page",
        );
        await screenshot("milestone-" + expected.toLowerCase());
        await click("View new card");
      } else {
        assert.equal(
          await evaluate(
            `Boolean(document.querySelector('[data-testid="milestone-prompt"]'))`,
          ),
          false,
          "No repeated milestone on ordinary purchases",
        );
        await click("View my Club");
      }
      await wait(
        `location.pathname.endsWith('/loyalty') && Array.from(document.querySelectorAll('[data-testid="club-membership"]')).some(n=>n.getClientRects().length && n.textContent.includes('${expected} membership') && n.textContent.includes('${number * 25} points'))`,
        "normal Club points and tier",
      );
      assert.equal(
        await evaluate(`document.body.innerText.includes('TEST PURCHASE')`),
        false,
      );
      await wait(
        `Array.from(document.querySelectorAll('[role="progressbar"]')).filter(n=>n.getClientRects().length && n.getAttribute('aria-valuemax')==='6' && n.getAttribute('aria-valuenow')==='${number}').length>=1`,
        "progress continues to Platinum",
      );
      await wait(
        `Array.from(document.querySelectorAll('[role="progressbar"]')).filter(n=>n.getClientRects().length && n.getAttribute('aria-valuemax')==='6').some(n=>Math.abs(n.firstElementChild.getBoundingClientRect().width/n.getBoundingClientRect().width-${number}/6)<0.02)`,
        "animated bar reaches confirmed progress",
      );
      if (milestone) {
        const card = await evaluate(
          `(()=>{ const card=Array.from(document.querySelectorAll('[aria-label="Flip membership card to show branch barcode"]')).find(n=>n.getClientRects().length);const r=card.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}; })()`,
        );
        assert.ok(
          card.top >= 80 && card.bottom <= card.height - 90,
          "New card brought into view: " + JSON.stringify(card),
        );
      }
      if (number >= 4) await screenshot("club-" + expected.toLowerCase());
      await click("View Club transactions");
      await wait(
        `document.body.innerText.includes('Your Club transactions') && Array.from(document.querySelectorAll('[aria-label="View receipt"]')).filter(n=>n.getClientRects().length).length === ${number}`,
        "Club transactions " + number,
      );
      assert.equal(
        await evaluate(
          `Array.from(document.querySelectorAll('[aria-label="View receipt"]')).filter(n=>n.getClientRects().length).length`,
        ),
        number,
      );
      if (number === tiers.length) await screenshot("club-transactions");
      const current = await observe("transactions-latest");
      assert.ok(
        current.text.includes("+25"),
        "Confirmed points appear in transaction list",
      );
      await evaluate(
        `Array.from(document.querySelectorAll('[aria-label="View receipt"]')).filter(n=>n.getClientRects().length)[0].click()`,
      );
      await wait(
        `location.pathname.endsWith('${latestId}') && document.querySelector('[data-testid="purchase-confirmation"]')`,
        "receipt from Club transaction",
      );
      await click("View my orders");
      await wait(
        `Array.from(document.querySelectorAll('[aria-label^="Open purchase"]')).filter(n=>n.getClientRects().length).length === ${number}`,
        "normal order history " + number,
      );
      if (number === tiers.length) await screenshot("purchase-orders");
      await click("Open purchase " + latestId.slice(-6));
      await wait(
        `document.querySelector('[data-testid="purchase-confirmation"]')`,
        "saved receipt from order history",
      );
      checks.push({
        purchase: number,
        points: number * 25,
        tier: expected,
        club: true,
        transactions: number,
        order_history: number,
        receipt: true,
        milestone_celebration: milestone,
        progress_to_final: `${number}/6`,
      });
      process.stdout.write(
        `Verified purchase ${number}: ${expected}, ${number * 25} points, Club, transactions, Orders and receipt.\n`,
      );
      if (number < tiers.length) {
        await click("Buy again");
        await wait(
          `document.body.innerText.includes('Earn +25 Club points')`,
          "repeat purchase",
        );
      }
    }
    await screenshot("purchase-receipt");
    await click("View my orders");
    await wait(
      `Array.from(document.querySelectorAll('[aria-label^="Open purchase"]')).filter(n=>n.getClientRects().length).length === ${tiers.length}`,
      "all preview orders",
    );
    await click("Open purchase " + firstReceipt.id.slice(-6));
    await wait(
      `document.querySelector('[data-testid="purchase-confirmation"]')?.textContent.includes('25 points at purchase')`,
      "first receipt remains immutable",
    );
    checks.push({
      first_receipt_immutable_after_later_purchases: true,
      global_payment_banner_removed: true,
      no_website_handoff: true,
    });
    const html = receiptHtml(firstReceipt);
    fs.writeFileSync(path.join(directory, "TEST-receipt.html"), html);
    fs.writeFileSync(
      path.join(directory, "TEST-receipt.json"),
      JSON.stringify(firstReceipt, null, 2),
    );
    // A separate paired review identity exercises each unsuccessful outcome.
    await send("Page.navigate", { url: origin + "/purchase-test" });
    await wait(
      `document.querySelector('input[aria-label="Access code"]')`,
      "review controls connection",
    );
    await fill("Access code", settings.code);
    await click("Connect membership");
    await wait(
      `document.body.innerText.includes('Earn +25 Club points')`,
      "review checkout",
    );
    if (
      !(await evaluate(
        `Boolean(document.querySelector('input[aria-label="Full name"]'))`,
      ))
    )
      await click("Billing details");
    await fill("Full name", "Cake City Review Customer");
    await fill("Billing email", "buyer@example.com");
    await fill("Billing address", "Collection, Nairobi");
    await click("Payment review controls");
    for (const outcome of ["failed", "timed out", "cancelled"]) {
      await click("Simulate " + outcome);
      await wait(
        `document.body.innerText.includes('No points were added') && !document.querySelector('[aria-busy="true"]')`,
        outcome + " settled",
      );
    }
    const failureState = await evaluate(
      `(async()=>{ const code = document.body.innerText; return code.includes('No points were added'); })()`,
    );
    assert.equal(failureState, true);
    // Reach Club using the existing tab; the state must still be Bronze with zero points.
    const controls = await observe("review-navigation");
    const clubTab = controls.controls.find(
      (n) => n.role === "tab" && /Club/.test(n.label),
    );
    const clubButton = controls.controls.find((n) =>
      /^(Club|Cake City Club|Open Club|Go to Club)$/.test(n.label),
    );
    assert.ok(clubTab || clubButton, "Visible Club navigation");
    await click((clubTab || clubButton).label);
    await wait(
      `Array.from(document.querySelectorAll('[data-testid="club-membership"]')).some(n=>n.getClientRects().length && n.textContent.includes('Bronze membership') && n.textContent.includes('0 points'))`,
      "failed outcomes leave Club unchanged",
    );
    await click("View Club transactions");
    await wait(
      `document.body.innerText.includes('Your next celebration starts here')`,
      "failed outcomes create no reward transactions",
    );
    checks.push({
      unsuccessful_outcomes_preserve_points: true,
      unsuccessful_outcomes_create_no_club_transactions: true,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await send("Page.navigate", { url: origin + "/checkout" });
    await wait(
      `document.querySelector('input[aria-label="Access code"]')`,
      "reduced motion connection",
    );
    await fill("Access code", settings.code);
    await click("Connect membership");
    await wait(
      `document.body.innerText.includes('Earn +25 Club points')`,
      "reduced motion checkout",
    );
    if (
      !(await evaluate(
        `Boolean(document.querySelector('input[aria-label="Full name"]'))`,
      ))
    )
      await click("Billing details");
    await fill("Full name", "Reduced Motion Review");
    await fill("Billing email", "buyer@example.com");
    await fill("Billing address", "Collection, Nairobi");
    await click("Pay KSh 100");
    await wait(
      `document.querySelector('[data-testid="purchase-confirmation"]')`,
      "first reduced motion receipt",
    );
    await click("Buy again");
    await wait(
      `document.body.innerText.includes('Earn +25 Club points')`,
      "second reduced motion checkout",
    );
    await click("Pay KSh 100");
    await wait(
      `document.querySelector('[data-testid="milestone-prompt"]')?.textContent.includes('Silver unlocked!')`,
      "reduced motion milestone prompt",
    );
    assert.equal(
      await evaluate(
        `Boolean(document.querySelector('[data-testid="milestone-confetti"]'))`,
      ),
      false,
      "Reduced motion disables confetti",
    );
    await screenshot("milestone-reduced-motion");
    await click("Dismiss milestone celebration");
    await wait(
      `!document.querySelector('[data-testid="milestone-prompt"]')`,
      "milestone prompt dismissed",
    );
    checks.push({
      side_confetti_and_view_new_card: true,
      reduced_motion_respected: true,
      milestone_prompt_dismissible: true,
    });
    // Export the same immutable receipt markup to a real standalone PDF.
    await send("Page.navigate", {
      url:
        "file:///" +
        path.join(directory, "TEST-receipt.html").replace(/\\/g, "/"),
    });
    await wait(
      `document.body.innerText.includes('Preview receipt')`,
      "standalone receipt",
    );
    const pdf = await send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
    });
    const bytes = Buffer.from(pdf.data, "base64");
    assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
    fs.writeFileSync(path.join(directory, "TEST-receipt.pdf"), bytes);
    await screenshot("test-receipt");
    assert.deepEqual(errors, [], "No runtime failures or external writes");
    fs.writeFileSync(
      path.join(directory, "browser-verification.json"),
      JSON.stringify(
        {
          passed: true,
          checks,
          pdfBytes: bytes.length,
          errors,
          native_device_tested: false,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      "Browser checks passed: six purchases through Platinum across checkout, Club, transactions, Orders and immutable receipts; failure outcomes and receipt PDF.\n",
    );
  } catch (error) {
    try {
      await captureFailure?.();
    } catch {}
    fs.writeFileSync(
      path.join(directory, "browser-verification.json"),
      JSON.stringify(
        {
          passed: false,
          checks,
          error: error.message,
          errors,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (send && socket?.readyState === WebSocket.OPEN) {
      try {
        await send("Browser.close");
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
