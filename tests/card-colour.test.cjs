require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const policy = require("../src/features/account/card-colour.ts");

test("only the final membership unlocks four colour choices without changing lower tiers", () => {
  assert.deepEqual(
    [...policy.cardColours],
    ["Silver", "Gold", "Diamond", "Platinum"],
  );
  for (const tier of [undefined, "Bronze", "Silver", "Gold", "Diamond"])
    for (const choice of policy.cardColours)
      assert.equal(policy.cardColourTier(tier, choice), tier);
  for (const choice of policy.cardColours)
    assert.equal(policy.cardColourTier("Platinum", choice), choice);
  for (const invalid of [null, "Bronze", "#ffffff", {}, "unknown"])
    assert.equal(policy.cardColourTier("Platinum", invalid), "Platinum");
});

function appearance() {
  let owner = "member-a",
    tier = "Platinum";
  const disk = new Map(),
    effects = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useEffect: (effect) => effects.push(effect),
      useState: (value) => [value, () => {}],
      useRef: (value) => ({ current: value }),
      useMemo: (fn) => fn(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Pressable: "Radio", Switch: "Switch", View: "View" },
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    zustand: {
      create: (initialise) => {
        let state = initialise();
        const store = (select) => select(state);
        store.getState = () => state;
        store.setState = (update) => {
          state = {
            ...state,
            ...(typeof update === "function" ? update(state) : update),
          };
        };
        return store;
      },
    },
    "@tanstack/react-query": { useQuery: () => ({ data: { tier } }) },
    "@/auth/AuthProvider": { useAuth: () => ({ customer: { id: owner } }) },
    "@/auth/secure-storage": {
      getStorageItem: async (key) => disk.get(key) || null,
      setStorageItem: async (key, value) => {
        disk.set(key, value);
      },
    },
    "@/components/ui/Typography": { Text: "Text" },
    "@/theme/ThemeProvider": {
      ThemeScope: "Theme",
      useTheme: () => ({ colors: {} }),
    },
    "./club-api": { clubApi: {} },
    "./member-card": require("../src/features/account/member-card.ts"),
    "./card-colour": policy,
    "./card-pages": require("../src/features/account/card-pages.ts"),
    "expo-router": { usePathname: () => "/home" },
  };
  const context = {
    exports: {},
    require: (id) => {
      assert.ok(modules[id], id);
      return modules[id];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/account/ClubAppearance.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    context,
  );
  const radios = (node) =>
    !node || typeof node !== "object"
      ? []
      : [
          ...(node.type === "Radio" ? [node] : []),
          ...[node.props?.children].flat(2).flatMap(radios),
        ];
  return {
    disk,
    hook: (value = tier) => context.exports.useCardColour(value),
    controls: () => radios(context.exports.ClubAppearanceControl()),
    switchAccount: (value, level = "Platinum") => {
      owner = value;
      tier = level;
    },
    hydrate: async () => {
      effects.splice(0).forEach((effect) => effect());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("colour controls save per account and leave another member on their own default", async () => {
  const app = appearance();
  const choices = app.controls();
  assert.equal(choices.length, 4);
  assert.equal(choices[3].props.accessibilityState.checked, true);
  choices[1].props.onPress();
  await app.hydrate();
  assert.equal(app.hook().tier, "Gold");
  assert.equal(app.disk.get("cakecity.card-colour.v1.member-a"), "Gold");
  app.switchAccount("member-b");
  assert.equal(app.hook().tier, "Platinum");
  app.switchAccount("member-a");
  assert.equal(app.hook().tier, "Gold");
  app.switchAccount("member-a", "Gold");
  assert.equal(app.controls().length, 0);
  app.hook().choose("Diamond");
  await app.hydrate();
  assert.equal(app.disk.get("cakecity.card-colour.v1.member-a"), "Gold");
});

test("a final member restores a saved colour and ignores malformed stored values", async () => {
  const app = appearance();
  app.disk.set("cakecity.card-colour.v1.member-a", "Diamond");
  app.hook();
  await app.hydrate();
  assert.equal(app.hook().tier, "Diamond");
  app.switchAccount("member-b");
  app.disk.set("cakecity.card-colour.v1.member-b", "invalid");
  app.hook();
  await app.hydrate();
  assert.equal(app.hook().tier, "Platinum");
});
