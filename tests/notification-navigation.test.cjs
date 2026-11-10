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
    "@/auth/secure-storage": {},
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
  assert.equal(
    notificationRoute({ reference: "APP-TEST-123" }).params.reference,
    "APP-TEST-123",
  );
  assert.equal(notificationRoute({ workspace: "rider" }), "/rider");
  assert.equal(notificationRoute({ reference: "APP-../private" }), null);
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
  listener({
    ...response,
    notification: {
      ...response.notification,
      request: {
        ...response.notification.request,
        content: { data: { customer_id: "another-customer" } },
      },
    },
  });
  assert.equal(
    pushed.length,
    0,
    "Another account's notification cannot open in this session",
  );
  listener(response);
  completeInitial(response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pushed, ["/moments"]);
  assert.equal(cleared, 1);
  cleanup();
  listener({ ...response, actionIdentifier: "another" });
  assert.equal(cleared, 1);
});

test("Android registration creates channels first, respects existing permission and binds to the private session", async () => {
  const calls = [];
  let permission = { granted: false, canAskAgain: true };
  const runtime = {
    AndroidImportance: { DEFAULT: 3, LOW: 2 },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationChannelAsync: async (id) => calls.push(id),
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => {
      calls.push("permission");
      return { granted: true };
    },
    getExpoPushTokenAsync: async ({ projectId }) => {
      assert.equal(projectId, "real-project");
      return { data: "ExpoPushToken[test-device]" };
    },
  };
  const { registerNotifications } = load("src/native/notifications.ts", {
    "react-native": { Platform: { OS: "android" } },
    "./notification-runtime": { getNativeNotifications: () => runtime },
    expo: { isRunningInExpoGo: () => false },
    "expo-constants": {
      __esModule: true,
      default: {
        expoConfig: { extra: { eas: { projectId: "real-project" } } },
      },
    },
    "@/auth/secure-storage": {
      getStorageItem: async () => "private-refresh-token-for-this-session",
    },
    "@/api/client": {
      api: {
        post: async (path, body, options) => {
          assert.equal(path, "/v1/account/notifications/devices");
          assert.equal(
            body.refresh_token,
            "private-refresh-token-for-this-session",
          );
          assert.equal(body.platform, "android");
          assert.equal(options.auth, true);
          calls.push("registered");
        },
      },
    },
  });
  await assert.rejects(registerNotifications(false), /disabled/);
  assert.ok(
    !calls.includes("permission"),
    "Silent registration must not request permission",
  );
  calls.length = 0;
  await registerNotifications();
  assert.deepEqual(calls, ["orders", "offers", "permission", "registered"]);
  permission = { granted: false, canAskAgain: false };
  calls.length = 0;
  await assert.rejects(registerNotifications(), /disabled/);
  assert.ok(
    !calls.includes("permission"),
    "Denied permission must direct the user to settings",
  );
});
