const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");

function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    },
  };
  vm.runInNewContext(source, context);
  return context.exports;
}

test("notification routing rejects unsupported and inherited object names", () => {
  const { notificationRoute } = load("src/native/notifications.ts", {
    "react-native": {},
    "./notification-runtime": {},
    expo: {},
    "expo-constants": {},
    "@/api/client": {},
  });
  for (const url of [
    "__proto__",
    "constructor",
    "toString",
    "https://example.com",
    "/missing",
  ])
    assert.equal(notificationRoute({ url }), null);
  assert.equal(notificationRoute({ url: "/account/moments" }), "/moments");
});

test("notification launch response and listener navigate once; old accounts cannot clear new responses", async () => {
  let effect;
  let listener;
  let completeInitial;
  const pushed = [];
  let cleared = 0;
  const notifications = {
    setNotificationHandler() {},
    getLastNotificationResponseAsync: () =>
      new Promise((resolve) => {
        completeInitial = resolve;
      }),
    addNotificationResponseReceivedListener: (handle) => {
      listener = handle;
      return { remove() {} };
    },
    clearLastNotificationResponseAsync: async () => {
      cleared++;
    },
  };
  const { NotificationObserver } = load("src/native/NotificationObserver.tsx", {
    react: {
      useEffect: (fn) => {
        effect = fn;
      },
      useRef: () => ({ current: null }),
    },
    "expo-router": { router: { push: (route) => pushed.push(route) } },
    "./notification-runtime": { getNativeNotifications: () => notifications },
    "@/auth/AuthProvider": {
      useAuth: () => ({ customer: { id: "first" }, restoring: false }),
    },
    "./notifications": { notificationRoute: () => "/moments" },
  });
  NotificationObserver();
  const cleanup = effect();
  const response = {
    actionIdentifier: "default",
    notification: {
      request: { identifier: "reminder-1", content: { data: {} } },
    },
  };
  listener(response);
  completeInitial(response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pushed, ["/moments"]);
  assert.equal(cleared, 1);
  cleanup();
  listener({ ...response, actionIdentifier: "another" });
  assert.equal(cleared, 1);
});
