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
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  assert.equal(
    (await (await fetch(apiOrigin + "/local-preview/status")).json())
      .local_preview,
    true,
  );
  const credentials = JSON.parse(
    fs.readFileSync(path.join(directory, "credentials.json"), "utf8"),
  );
  const browser = [
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Microsoft/Edge/Application/msedge.exe",
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
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let socket;
  let send;
  try {
    let target;
    for (let i = 0; i < 60; i++) {
      try {
        target = (
          await (await fetch("http://127.0.0.1:9349/json/list")).json()
        ).find((tab) => tab.type === "page");
      } catch {}
      if (target) break;
      await pause(250);
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
        const id = ++sequence;
        const timeout = setTimeout(() => {
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
        } else
          void send("Fetch.continueRequest", {
            requestId: message.params.requestId,
          }).catch((error) => {
            if (!/Invalid InterceptionId|closed/i.test(error.message))
              errors.push(error.message);
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
    async function observe(name) {
      const state = await evaluate(
        `({url:location.pathname,inputs:Array.from(document.querySelectorAll('input,textarea')).map(n=>({label:n.getAttribute('aria-label'),type:n.type})),buttons:Array.from(document.querySelectorAll('[role="button"],button,a')).map(n=>({label:n.getAttribute('aria-label')||n.innerText?.trim(),href:n.getAttribute('href')})),text:document.body.innerText.slice(0,6500)})`,
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
    async function fill(label, value) {
      const state = await observe("browser-latest");
      assert.equal(
        state.inputs.filter((item) => item.label === label).length,
        1,
        "Input must be unique: " + label,
      );
      await evaluate(
        `(()=>{const n=Array.from(document.querySelectorAll('input,textarea')).find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)});const p=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`,
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
        `Array.from(document.querySelectorAll('[role="button"],button,a')).find(n=>(n.getAttribute('aria-label')||n.innerText?.trim())===${JSON.stringify(label)}).click()`,
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
        180000,
      );
      await fill("Email address", credentials.accounts[role].email);
      await fill("Password", credentials.accounts[role].password);
      await click("Sign in");
      await wait(
        `!location.pathname.includes('sign-in')`,
        "authenticated navigation",
      );
      await observe(role + "-signed-in");
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
      if (role === "customer") {
        await click("Cake City for business");
        await wait(
          `document.body.innerText.includes('Register your company')`,
          "corporate workspace",
        );
        await capture("corporate-preview");
      } else {
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
    assert.deepEqual(errors, [], "Unexpected runtime failures/external writes");
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
