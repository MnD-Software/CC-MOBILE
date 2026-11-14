require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const {
  validatedPreferences,
} = require("../src/features/commerce/preference-validation.ts");
const {
  publicEntryRoute,
  accountDestination,
} = require("../src/auth/route-access.ts");

test("broken saved preferences cannot crash account/profile/DIY after login", () => {
  const good = {
    id: "keep",
    name: "Caramel",
    version: "inventory-v1",
    selections: { colour: ["#FFF8EE"] },
    message: "Happy birthday",
    updated_at: "2026-11-14",
  };
  for (const bad of [
    null,
    [],
    "old state",
    { savedProductSlugs: null, designs: null, profileAvatars: null },
  ]) {
    const prefs = validatedPreferences(bad);
    assert.equal(prefs.savedProductSlugs.length, 0);
    assert.deepEqual(prefs.designs, {});
  }
  const prefs = validatedPreferences({
    designs: { alice: [null, { id: "broken" }, good], bob: "broken" },
    savedProductSlugs: ["cake"],
    profileAvatars: {
      alice: { kind: "photo", value: "file:///photo.jpg" },
      bob: null,
    },
  });
  assert.deepEqual(prefs.designs.alice, [good]);
  assert.deepEqual(prefs.designs.bob, []);
  assert.equal(prefs.profileAvatars.bob, undefined);
  assert.deepEqual(prefs.savedProductSlugs, ["cake"]);
});
test("sign up/reset/legal are public, shopping and departments require an account", () => {
  for (const route of [
    "/sign-in",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/legal",
    "/information/privacy-policy",
  ])
    assert.equal(publicEntryRoute(route), true);
  for (const route of [
    "/",
    "/home",
    "/custom",
    "/shop",
    "/checkout",
    "/workspace",
    "/order/one",
  ])
    assert.equal(publicEntryRoute(route), false);
  assert.equal(accountDestination("customer"), "/home");
  assert.equal(accountDestination("corporate_client"), "/corporate");
  assert.equal(accountDestination("dispatch"), "/workspace");
});
function extract(file, name) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  );
  return ts.transpileModule(
    fn.getText(ast).replace(/^export /, "") + `\nexports.component=${name};`,
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}
function hooks() {
  let index = 0;
  const slots = [],
    effects = [];
  let pending = [];
  return {
    begin() {
      index = 0;
      pending = [];
    },
    flush() {
      for (const e of pending) e();
    },
    useState(value) {
      const i = index++;
      if (!(i in slots))
        slots[i] = typeof value === "function" ? value() : value;
      return [
        slots[i],
        (v) => {
          slots[i] = typeof v === "function" ? v(slots[i]) : v;
        },
      ];
    },
    useRef(value) {
      const i = index++;
      return (slots[i] ??= { current: value });
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j]))
        pending.push(() => {
          effects[i]?.cleanup?.();
          effects[i] = { deps, cleanup: fn() };
        });
    },
  };
}
const jsx = (type, props, key) => ({ type, props, key });
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree)) {
    for (const x of tree) {
      const result = find(x, predicate);
      if (result) return result;
    }
    return null;
  }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}
test("auth boundary waits for root navigation and does not compete with login role redirect", () => {
  const h = hooks();
  let customer = null,
    path = "/shop",
    ready = false;
  const routes = [];
  const context = {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }),
    ...h,
    useAuth: () => ({ customer, restoring: false }),
    useTheme: () => ({ colors: {} }),
    usePathname: () => path,
    useRootNavigationState: () => (ready ? { key: "root" } : undefined),
    publicEntryRoute,
    isStaffRole: (role) => !!role && role !== "customer",
    staffRouteAllowed: () => false,
    rememberCustomerRoute: () => {},
    router: { replace: (r) => routes.push(r) },
    View: "View",
    ActivityIndicator: "Spinner",
  };
  vm.runInNewContext(
    extract("src/auth/StaffRouteBoundary.tsx", "StaffRouteBoundary"),
    context,
  );
  const render = () => {
    h.begin();
    context.exports.component({ children: null });
    h.flush();
  };
  render();
  assert.deepEqual(routes, []);
  ready = true;
  render();
  assert.deepEqual(routes, ["/sign-in"]);
  path = "/sign-in";
  customer = { id: "dispatch", role: "dispatch" };
  render();
  assert.deepEqual(routes, ["/sign-in"]);
  path = "/shop";
  render();
  assert.deepEqual(routes, ["/sign-in", "/workspace"]);
});
test("new DIY sketches preserve prior saves even when the same cake and size are selected", () => {
  const h = hooks();
  let serial = 0;
  const designs = { alice: [] };
  const cake = {
    id: 12,
    name: "Caramel cake",
    price_minor: 100000,
    variants: [],
    canvas_colour: "#FFF8EE",
    image: "https://example.com/cake.jpg",
  };
  const prefs = {
    designs,
    saveDesign(owner, design) {
      designs[owner] = [
        design,
        ...designs[owner].filter((x) => x.id !== design.id),
      ];
    },
    deleteDesign() {},
  };
  const context = {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }),
    ...h,
    useSafeAreaInsets: () => ({ bottom: 0 }),
    useTheme: () => ({ colors: {} }),
    useAuth: () => ({ customer: { id: "alice" } }),
    useToast: () => () => {},
    useBag: (fn) => fn({ addBundle: () => true }),
    usePreferences: (fn) => fn(prefs),
    randomUUID: () => "draft-" + ++serial,
    EMPTY_DESIGNS: [],
    setTimeout: () => 1,
    clearTimeout() {},
    useQuery: (options) => ({
      data: options.queryKey[0] === "diy-inventory" ? [cake] : [],
      isPending: false,
      isError: false,
    }),
    api: {},
    Screen: "Screen",
    View: "View",
    Pressable: "Pressable",
    LinearGradient: "Gradient",
    Text: "Text",
    Button: "Button",
    Input: "Input",
    ScrollView: "ScrollView",
    TextInput: "TextInput",
    Ionicons: "Icon",
    CakeCanvas: "Canvas",
    CustomCakeBrief: "Inspo",
    SizeFinishPicker: "Sizes",
    Notice: "Notice",
    Feedback: "Feedback",
    Skeleton: "Skeleton",
    LoadingImage: "Image",
    Disclosure: "Disclosure",
    cash: String,
    swatches: ["#FFF8EE"],
    appMedia: (x) => x,
    router: { push() {} },
    Date,
    Math,
    Set,
    encodeURIComponent,
  };
  vm.runInNewContext(
    extract("src/features/studio/InventoryStudio.tsx", "InventoryEditor"),
    context,
  );
  let tree;
  const render = () => {
    h.begin();
    tree = context.exports.component();
    h.flush();
  };
  const choose = () => {
    const radio = find(
      tree,
      (n) => n.props?.accessibilityRole === "radio" && n.key === 12,
    );
    assert.ok(radio);
    radio.props.onPress();
    render();
  };
  render();
  choose();
  assert.ok(tree.props.right);
  tree.props.right.props.onPress();
  render();
  assert.equal(designs.alice.length, 1);
  assert.equal(tree.props.right, undefined);
  choose();
  find(
    tree,
    (n) => n.type === "Button" && n.props.label === "Save to my sketchbook",
  ).props.onPress();
  render();
  assert.equal(designs.alice.length, 2);
  assert.notEqual(designs.alice[0].id, designs.alice[1].id);
});

test("biometric preferences never carry an old account's state through a switch", async () => {
  const h = hooks();
  let owner = "alice";
  const reads = [];
  const listeners = new Set();
  const context = {
    exports: {},
    ...h,
    getStorageItem: () =>
      new Promise((resolve, reject) => reads.push({ resolve, reject })),
    key: (x) => x,
    listeners,
    unlockDevice: async () => {},
    setStorageItem: async () => {},
  };
  vm.runInNewContext(
    extract("src/auth/biometrics.ts", "useBiometricPreference"),
    context,
  );
  const render = () => {
    h.begin();
    const value = context.exports.component(owner);
    h.flush();
    return value;
  };
  render();
  reads[0].resolve("1");
  await Promise.resolve();
  assert.equal(render().enabled, true);
  owner = "bob";
  const switching = render();
  assert.equal(switching.ready, false);
  assert.equal(switching.enabled, false);
  reads[1].resolve("0");
  await Promise.resolve();
  assert.equal(render().ready, true);
  assert.equal(render().enabled, false);
  owner = "charlie";
  render();
  owner = "dana";
  render();
  reads[2].resolve("1");
  reads[3].resolve("0");
  await Promise.resolve();
  assert.equal(render().enabled, false);
});

test("a biometric prompt finishing late cannot unlock the next account", async () => {
  const h = hooks();
  let customer = { id: "alice" };
  let finish;
  const context = {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }),
    ...h,
    useAuth: () => ({ customer, logout: async () => {} }),
    useTheme: () => ({ colors: {} }),
    useBiometricPreference: () => ({ ready: true, enabled: true }),
    recentlyUnlocked: () => false,
    AppState: { addEventListener: () => ({ remove() {} }) },
    View: "View",
    Text: "Text",
    BrandLogo: "Logo",
    Button: "Button",
    unlockDevice: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    disableBiometricUnlock: async () => {},
    Date,
  };
  vm.runInNewContext(
    extract("src/auth/BiometricGate.tsx", "BiometricGate"),
    context,
  );
  let tree;
  const render = () => {
    h.begin();
    tree = context.exports.component({ children: "private content" });
    h.flush();
  };
  render();
  render();
  find(
    tree,
    (n) => n.type === "Button" && n.props.label === "Use Face ID / fingerprint",
  ).props.onPress();
  customer = { id: "bob" };
  render();
  render();
  finish();
  await Promise.resolve();
  await Promise.resolve();
  render();
  assert.equal(tree.props.children[0].props.pointerEvents, "none");
  assert.ok(
    find(
      tree,
      (n) =>
        n.type === "Button" &&
        n.props.label === "Sign in with account password",
    ),
  );
});
