require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = ts.transpileModule(
  fs.readFileSync("src/auth/AuthProvider.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const turn = () => new Promise((resolve) => setImmediate(resolve));
function session(id) {
  return {
    customer: { id },
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_in: 300,
  };
}
function load(storageOverrides = {}, apiOverrides = {}) {
  const calls = { claimed: [], wiped: [], revoked: [] };
  class ApiError extends Error {
    constructor(message, init = {}) {
      super(message);
      this.code = init.code;
      this.status = init.status ?? null;
    }
  }
  const connectivity = { state: "unknown", listeners: new Set() };
  const slots = [];
  const effects = [];
  let cursor = 0;
  let token = null;
  const storage = new Map();
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect(fn) {
      effects.push(fn);
    },
  };
  const context = {
    setTimeout,
    clearTimeout,
    exports: {},
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (_type, props) => props };
      if (name === "react-native")
        return { AppState: { addEventListener: () => ({ remove() {} }) } };
      if (name === "@tanstack/react-query")
        return {
          useQueryClient: () => ({ invalidateQueries: async () => {} }),
        };
      if (name === "@/api/client")
        return {
          ApiError,
          setAccessToken: (value) => {
            token = value;
          },
          clearAccessToken: () => {
            token = null;
          },
          setSessionRefresher() {},
        };
      if (name === "./secure-storage")
        return {
          getStorageItem: async (key) => storage.get(key) ?? null,
          setStorageItem: async (key, value) => {
            storage.set(key, value);
          },
          deleteStorageItem: async (key) => {
            storage.delete(key);
          },
          ...storageOverrides,
        };
      if (name === "./api")
        return {
          authApi: {
            login: async (id) => session(id),
            logout: async (token) => {
              calls.revoked.push(token);
            },
            ...apiOverrides,
          },
        };
      if (name === "./session-unlock")
        return { markAccountUnlocked() {}, forgetAccountUnlock() {} };
      if (name === "./query-privacy") return { clearPrivateQueryCache() {} };
      if (name === "./local-session")
        return {
          claimDeviceState: (owner) => calls.claimed.push(owner),
          wipeLocalSession: async (_cache, owner) => {
            calls.wiped.push(owner);
          },
        };
      if (name === "./restore-policy")
        return require("../src/auth/restore-policy.ts");
      if (name === "@/platform/connectivity")
        return {
          connectivityState: () => connectivity.state,
          subscribeToConnectivity(listener) {
            connectivity.listeners.add(listener);
            return () => connectivity.listeners.delete(listener);
          },
        };
      throw new Error(name);
    },
  };
  vm.runInNewContext(source, context);
  return {
    render() {
      cursor = 0;
      return context.exports.AuthProvider({}).value;
    },
    storage,
    effects,
    calls,
    slots,
    ApiError,
    goOnline() {
      connectivity.state = "online";
      for (const listener of connectivity.listeners) listener();
    },
    token: () => token,
  };
}

test("late login storage cannot delete the newer account's refresh token", async () => {
  let finishFirst;
  const stored = new Map();
  const value = load({
    setStorageItem: async (key, token) => {
      if (token === "refresh-first")
        await new Promise((resolve) => {
          finishFirst = resolve;
        });
      stored.set(key, token);
    },
    deleteStorageItem: async (key) => {
      stored.delete(key);
    },
  });
  const auth = value.render();
  const first = auth.login("first", "password");
  await turn();
  const second = auth.login("second", "password");
  await turn();
  finishFirst();
  await Promise.all([first, second]);
  assert.equal(value.render().customer.id, "second");
  assert.equal(stored.get("cakecity.refresh-token"), "refresh-second");
  assert.equal(value.token(), "access-second");
});

test("a failed login does not discard a refresh already rotating the current account", async () => {
  let finishRefresh;
  const value = load(
    {},
    {
      refresh: async () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
      login: async (id) => {
        if (id === "failed") throw new Error("Invalid password");
        return session(id);
      },
    },
  );
  await value.render().login("first", "password");
  value.render();
  value.effects[0]();
  await turn();
  const login = value.render().login("failed", "password");
  finishRefresh({ ...session("first"), refresh_token: "rotated-first" });
  await assert.rejects(login, /Invalid password/);
  assert.equal(value.storage.get("cakecity.refresh-token"), "rotated-first");
  assert.equal(value.render().customer.id, "first");
});

test("logout clears visible identity immediately even when secure storage cannot be read", async () => {
  const value = load({
    getStorageItem: async () => {
      throw new Error("Keychain locked");
    },
  });
  await value.render().login("first", "password");
  assert.equal(value.render().customer.id, "first");
  const logout = value.render().logout();
  assert.equal(value.render().customer, null);
  assert.equal(value.token(), null);
  await logout;
  assert.equal(value.storage.size, 0);
});

test("logout during a login write cannot resurrect the previous session", async () => {
  let complete;
  const value = load({
    setStorageItem: async () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const login = value.render().login("first", "password");
  await turn();
  const logout = value.render().logout();
  complete();
  await Promise.all([login, logout]);
  assert.equal(value.render().customer, null);
  assert.equal(value.token(), null);
});

test("profile save updates the current account without changing its tokens", async () => {
  const value = load(
    {},
    { updateProfile: async (input) => ({ id: "first", ...input }) },
  );
  await value.render().login("first", "password");
  await value
    .render()
    .updateProfile({ first_name: "Amina", last_name: "Owner", phone: null });
  assert.equal(value.render().customer.first_name, "Amina");
  assert.equal(value.storage.get("cakecity.refresh-token"), "refresh-first");
  assert.equal(value.token(), "access-first");
});

test("a failed profile save preserves the current identity", async () => {
  const value = load(
    {},
    {
      updateProfile: async () => {
        throw new Error("Offline");
      },
    },
  );
  await value.render().login("first", "password");
  await assert.rejects(
    value.render().updateProfile({
      first_name: "Changed",
      last_name: "Owner",
      phone: null,
    }),
    /Offline/,
  );
  assert.deepEqual(value.render().customer, { id: "first" });
});

test("a profile response after an account switch cannot alter the new member", async () => {
  let finish;
  const value = load(
    {},
    {
      updateProfile: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  );
  await value.render().login("first", "password");
  const save = value
    .render()
    .updateProfile({ first_name: "Changed", last_name: "Owner", phone: null });
  await value.render().login("second", "password");
  finish({ id: "first", first_name: "Changed" });
  await assert.rejects(save, /account changed/);
  assert.equal(value.render().customer.id, "second");
  assert.equal(value.token(), "access-second");
});

test("an older in-flight refresh cannot overwrite a confirmed profile save", async () => {
  let finishRefresh;
  const value = load(
    {},
    {
      refresh: () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
      updateProfile: async (input) => ({ id: "first", ...input }),
    },
  );
  await value.render().login("first", "password");
  value.render();
  value.effects[0]();
  await turn();
  const save = value
    .render()
    .updateProfile({ first_name: "New name", last_name: "Owner", phone: null });
  await turn();
  finishRefresh({
    ...session("first"),
    customer: { id: "first", first_name: "Old name" },
  });
  await save;
  assert.equal(value.render().customer.first_name, "New name");
});

test("each sign-in claims device state for its owner and logout wipes it", async () => {
  const value = load();
  await value.render().login("first", "password");
  await value.render().login("second", "password");
  assert.deepEqual(value.calls.claimed, ["first", "second"]);
  await value.render().logout();
  assert.deepEqual(value.calls.wiped, ["second"]);
  assert.deepEqual(value.calls.revoked, ["refresh-second"]);
});

test("a revoked refresh runs the same local wipe as logout", async () => {
  let fail;
  const value = load(
    {},
    {
      refresh: () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    },
  );
  await value.render().login("first", "password");
  value.render();
  value.effects[0]();
  await turn();
  fail(new value.ApiError("Expired", { code: "AUTH_EXPIRED", status: 401 }));
  await turn();
  await turn();
  assert.equal(value.render().customer, null);
  assert.equal(value.render().restoring, false);
  assert.deepEqual(value.calls.wiped, ["first"]);
  assert.equal(value.storage.has("cakecity.refresh-token"), false);
});

test("a refresh that lands after sign-out revokes the rotated token", async () => {
  let finish;
  const value = load(
    {},
    {
      refresh: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  );
  await value.render().login("first", "password");
  value.render();
  value.effects[0]();
  await turn();
  const logout = value.render().logout();
  finish({ ...session("first"), refresh_token: "rotated-first" });
  await logout;
  await turn();
  await turn();
  assert.equal(value.render().customer, null);
  assert.ok(value.calls.revoked.includes("rotated-first"));
  assert.equal(value.storage.has("cakecity.refresh-token"), false);
});

test("an offline cold start keeps restoring and retries when the connection returns", async () => {
  let attempts = 0;
  const value = load(
    {},
    {
      refresh: async () => {
        if (++attempts === 1)
          throw new value.ApiError("Offline", { code: "NETWORK_ERROR" });
        return session("first");
      },
    },
  );
  value.storage.set("cakecity.refresh-token", "refresh-first");
  value.render();
  value.effects[0]();
  for (let i = 0; i < 5; i++) await turn();
  assert.equal(value.render().restoring, true);
  assert.equal(value.render().customer, null);
  assert.equal(value.storage.get("cakecity.refresh-token"), "refresh-first");
  value.goOnline();
  for (let i = 0; i < 5; i++) await turn();
  assert.equal(attempts, 2);
  assert.equal(value.render().customer.id, "first");
  assert.equal(value.render().restoring, false);
});

test("a rejected saved token still signs out on cold start", async () => {
  const value = load(
    {},
    {
      refresh: async () => {
        throw new value.ApiError("Revoked", { code: "AUTH", status: 403 });
      },
    },
  );
  value.storage.set("cakecity.refresh-token", "refresh-first");
  value.render();
  value.effects[0]();
  for (let i = 0; i < 5; i++) await turn();
  assert.equal(value.render().restoring, false);
  assert.equal(value.storage.has("cakecity.refresh-token"), false);
});
