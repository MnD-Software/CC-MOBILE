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
          slots[index] = value;
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
    exports: {},
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (_type, props) => props };
      if (name === "react-native")
        return { AppState: { addEventListener: () => ({ remove() {} }) } };
      if (name === "@tanstack/react-query")
        return { useQueryClient: () => ({}) };
      if (name === "@/api/client")
        return {
          ApiError: class extends Error {},
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
            logout: async () => {},
            ...apiOverrides,
          },
        };
      if (name === "./query-privacy") return { clearPrivateQueryCache() {} };
      if (name.endsWith("website-checkout-session"))
        return {
          clearWebsiteCheckoutSession: async () => {},
          clearWebsitePaymentAttempt: async () => {},
        };
      if (name.endsWith("website-order-history"))
        return { clearLegacyWebsiteOrderHistory: async () => {} };
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
