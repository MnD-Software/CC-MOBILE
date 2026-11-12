const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function rider({ permission = true } = {}) {
  const store = new Map();
  const calls = [];
  let handler,
    running = false,
    status = 200;
  const location = {
    Accuracy: { High: 4 },
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    requestBackgroundPermissionsAsync: async () => ({ granted: permission }),
    hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => running,
    startLocationUpdatesAsync: async () => {
      running = true;
    },
    stopLocationUpdatesAsync: async () => {
      running = false;
    },
  };
  const modules = {
    "expo-location": location,
    "expo-task-manager": {
      isAvailableAsync: async () => true,
      isTaskDefined: () => false,
      defineTask: (_, callback) => {
        handler = callback;
      },
    },
    "expo-secure-store": {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 3,
      getItemAsync: async (key) => store.get(key) ?? null,
      setItemAsync: async (key, value) => store.set(key, value),
      deleteItemAsync: async (key) => store.delete(key),
    },
    "react-native": { Platform: { OS: "ios" } },
    "@/config/env": { env: { apiUrl: "https://local.example" } },
    "@/auth/secure-storage": {
      getStorageItem: async () => "private-refresh-token",
    },
    "@/api/client": {
      api: {
        post: async (...args) => {
          calls.push({ create: args });
          return {
            token: "trip-only-grant",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          };
        },
      },
    },
  };
  const context = {
    exports: {},
    Date,
    AbortSignal,
    AbortController,
    setTimeout,
    clearTimeout,
    require: (name) => {
      assert.ok(modules[name], name);
      return modules[name];
    },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return { status };
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/native/rider-background.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return {
    api: context.exports,
    calls,
    store,
    running: () => running,
    stopSystemService: () => {
      running = false;
    },
    status: (value) => {
      status = value;
    },
    fix: async (accuracy = 10, timestamp = Date.now()) =>
      handler({
        data: {
          locations: [
            {
              timestamp,
              coords: { latitude: -1.28, longitude: 36.82, accuracy },
            },
          ],
        },
      }),
  };
}

test("rider background location requires explicit permission before granting or starting GPS", async () => {
  const r = rider({ permission: false });
  await assert.rejects(r.api.startBackgroundSharing("task-1"), /Always allow/);
  assert.equal(r.calls.length, 0);
  assert.equal(r.running(), false);
});
test("background GPS sends only a trip credential, rejects stale fixes and stops on terminal status", async () => {
  const r = rider();
  assert.equal(r.calls.length, 0);
  await r.api.startBackgroundSharing("task-1");
  assert.equal(r.running(), true);
  assert.equal(await r.api.backgroundTrip(), "task-1");
  await r.fix(300);
  await r.fix(10, Date.now() - 130000);
  assert.equal(r.calls.filter((c) => c.method === "PUT").length, 0);
  await r.fix();
  const sent = r.calls.find((c) => c.method === "PUT");
  assert.equal(sent.headers.Authorization, "Bearer trip-only-grant");
  assert.ok(!sent.body.includes("refresh"));
  r.status(409);
  await r.fix();
  assert.equal(r.running(), false);
  assert.equal(await r.api.backgroundTrip(), null);
  assert.ok(r.calls.some((c) => c.method === "DELETE"));
});
test("explicit stop removes locked-phone credentials and stops the GPS service", async () => {
  const r = rider();
  await r.api.startBackgroundSharing("task-2");
  await r.api.stopBackgroundSharing("obsolete-grant");
  assert.equal(r.running(), true);
  await r.api.stopBackgroundSharing();
  assert.equal(r.running(), false);
  assert.equal(r.store.size, 0);
});

test("returning to a rider screen does not claim sharing when the OS stopped the service", async () => {
  const r = rider();
  await r.api.startBackgroundSharing("task-3");
  r.stopSystemService();
  assert.equal(await r.api.backgroundTrip(), null);
  assert.equal(r.store.size, 0);
});
