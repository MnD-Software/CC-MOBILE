require("./register.cjs");
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  vm = require("node:vm");
const jsx = (type, props) => ({ type, props });
function findAll(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findAll(n, predicate));
  return [
    ...(predicate(node) ? [node] : []),
    ...findAll(node.props?.children, predicate),
    ...findAll(node.props?.extraControls, predicate),
  ];
}
function loadFunctions(file, names, context) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const source =
    ast.statements
      .filter(
        (n) => ts.isFunctionDeclaration(n) && names.includes(n.name?.text),
      )
      .map((n) => n.getText(ast).replace(/^export /, ""))
      .join("\n") +
    "\n" +
    names.map((n) => `exports.${n}=${n};`).join("\n");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
function studio() {
  let index = 0,
    slots = [],
    active = true;
  const props = {
    image: "https://example.com/cake.jpg",
    name: "Milky Caramel",
    colour: "#FFF8EE",
    message: "",
    candles: false,
    price: "KES 4,400",
  };
  const context = {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }),
    useTheme: () => ({
      colors: {
        surface: "#FFF",
        surfaceRaised: "#F8F3F6",
        border: "#DDD",
        ink: "#221",
        muted: "#665",
        brandStrong: "#B80068",
        brandLight: "#FDE",
      },
    }),
    useWindowDimensions: () => ({ height: 844 }),
    useMotionAccessibilityPreference: () => ({ reduceMotion: false }),
    useScreenActive: () => active,
    useDeviceTier: () => "full",
    useState: (v) => {
      const n = index++;
      if (!(n in slots)) slots[n] = v;
      return [
        slots[n],
        (v) => (slots[n] = typeof v === "function" ? v(slots[n]) : v),
      ];
    },
    useRef: (v) => {
      const n = index++;
      return (slots[n] ??= { current: v });
    },
    useMemo: (fn) => fn(),
    cakeSceneConfig: (x) => x,
    cakeScene: () => "<canvas/>",
    performHaptic: () => {},
    Pressable: "Pressable",
    View: "View",
    Text: "Text",
    GlassSurface: "GlassSurface",
    StageControl: "StageControl",
    LoadingImage: "LoadingImage",
    ModelScene: "ModelScene",
    BottomSheet: "BottomSheet",
  };
  const { CakeStage, stageHeight } = loadFunctions(
    "src/features/studio/CakeStage.tsx",
    ["CakeStage", "stageHeight"],
    context,
  );
  return {
    props,
    stageHeight,
    render() {
      index = 0;
      return CakeStage(props);
    },
    inactive() {
      active = false;
    },
  };
}
test("DIY is live 3D only, with scissors and enlarge controls and no Real cake option", () => {
  const s = studio();
  let tree = s.render();
  assert.equal(findAll(tree, (n) => n.type === "ModelScene").length, 1);
  assert.equal(findAll(tree, (n) => n.type === "LoadingImage").length, 0);
  // No Real cake tab or photo switch anywhere.
  assert.equal(
    findAll(tree, (n) => /Real cake|bakery photo/i.test(String(n.props?.label ?? n.props?.accessibilityLabel ?? ""))).length,
    0,
  );
  // The scissors (inside layers) sit beside the enlarge button inline.
  const scissors = findAll(tree, (n) => n.props?.label === "Show inside layers");
  assert.equal(scissors.length, 1);
  assert.equal(findAll(tree, (n) => n.props?.label === "Enlarge preview").length, 1);
  scissors[0].props.onPress();
  tree = s.render();
  assert.equal(
    findAll(tree, (n) => n.type === "ModelScene")[0].props.config.slice,
    true,
  );
  s.props.colour = "#EEAACC";
  tree = s.render();
  assert.equal(
    findAll(tree, (n) => n.type === "ModelScene")[0].props.config.colour,
    "#EEAACC",
  );
});
test("full preview never mounts a second GPU scene and pauses motion away from the screen", () => {
  const s = studio();
  let tree = s.render();
  findAll(tree, (n) => n.props?.label === "Enlarge preview")[0].props.onPress();
  tree = s.render();
  assert.equal(findAll(tree, (n) => n.type === "ModelScene").length, 1);
  assert.equal(
    findAll(tree, (n) => n.type === "BottomSheet")[0].props.visible,
    true,
  );
  findAll(tree, (n) => n.type === "BottomSheet")[0].props.onClose();
  s.inactive();
  tree = s.render();
  assert.equal(
    findAll(tree, (n) => n.type === "ModelScene")[0].props.config.reduceMotion,
    true,
  );
  assert.equal(s.stageHeight(568, false), 112);
  assert.equal(s.stageHeight(844, false), 180);
});
test("failed GPU shows a plain product photo, without the slice control", () => {
  const s = studio();
  let tree = s.render();
  findAll(tree, (n) => n.type === "ModelScene")[0].props.onUnavailable();
  tree = s.render();
  assert.equal(findAll(tree, (n) => n.type === "ModelScene").length, 0);
  assert.equal(findAll(tree, (n) => n.type === "LoadingImage").length, 1);
  assert.equal(
    findAll(tree, (n) => n.props?.label === "Show inside layers").length,
    0,
  );
});
test("Android glass gets a nonblocking finish without per-card blur; opaque/high-contrast surfaces stay solid", () => {
  let highContrast = false;
  const context = {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }),
    Platform: { OS: "android" },
    useTheme: () => ({
      colors: { surface: "#FFF" },
      isDark: false,
      highContrast,
    }),
    useThemedStyles: () => ({ surface: { overflow: "hidden" } }),
    baseStyles: {},
    useContext: () => false,
    GlassPreferences: {},
    themeColor: (_, v) => v,
    View: "View",
    BlurView: "BlurView",
    LinearGradient: "LinearGradient",
    StyleSheet: { absoluteFill: { position: "absolute" } },
    liquidGlassAvailable: false,
  };
  const { GlassSurface } = loadFunctions(
    "src/components/storefront/GlassSurface.tsx",
    ["GlassSurface"],
    context,
  );
  let tree = GlassSurface({ children: "Content" });
  assert.equal(findAll(tree, (n) => n.type === "BlurView").length, 0);
  assert.equal(findAll(tree, (n) => n.type === "LinearGradient").length, 2);
  assert.equal(
    findAll(tree, (n) => n.props?.pointerEvents === "none").length,
    1,
  );
  assert.equal(
    findAll(GlassSurface({ opaque: true }), (n) => n.type === "LinearGradient")
      .length,
    0,
  );
  highContrast = true;
  assert.equal(
    findAll(GlassSurface({}), (n) => n.type === "LinearGradient").length,
    0,
  );
});
