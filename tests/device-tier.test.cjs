require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// device-tier reads react-native at import; give it a minimal stand-in.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "react-native")
    return {
      Platform: { OS: "android", Version: 33 },
      PixelRatio: { get: () => 3 },
      Dimensions: { get: () => ({ width: 412, height: 915 }) },
    };
  return load.call(this, request, ...rest);
};
const { guessTier, tierFromFrames } = require("../src/design/device-tier.ts");
Module._load = load;
const {
  parsePlacement,
  placementPayload,
  DEFAULT_PLACEMENT,
} = require("../src/features/studio/real-cake.ts");
const { cakeSceneConfig, cakeScene } = require("../src/features/studio/cake-scene.ts");

const phone = (os, version, extra = {}) => ({
  os,
  version,
  pixelRatio: 3,
  width: 412,
  height: 915,
  ...extra,
});

test("budget and older phones get the lite tier; modern phones keep everything", () => {
  assert.equal(guessTier(phone("android", 33)), "full");
  assert.equal(guessTier(phone("android", 28)), "lite");
  assert.equal(guessTier(phone("android", 31, { pixelRatio: 1.5, width: 360, height: 640 })), "lite");
  assert.equal(guessTier(phone("ios", "17.4")), "full");
  assert.equal(guessTier(phone("ios", "14.8")), "lite");
  assert.equal(guessTier(phone("web", "", { cores: 2 })), "lite");
  assert.equal(guessTier(phone("web", "", { cores: 8, memoryGb: 8 })), "full");
});

test("a measured frame rate below 45 fps downgrades; too few samples decide nothing", () => {
  assert.equal(tierFromFrames(Array(60).fill(16.7)), "full");
  assert.equal(tierFromFrames(Array(40).fill(33)), "lite");
  assert.equal(tierFromFrames(Array(5).fill(33)), null);
  // One long pause (e.g. a GC) does not condemn a fast phone.
  assert.equal(tierFromFrames([...Array(59).fill(16.7), 900]), "full");
});

test("saved or ordered placement is sanitised and compact", () => {
  assert.deepEqual(parsePlacement(null), DEFAULT_PLACEMENT);
  assert.deepEqual(parsePlacement({ plaque: { x: "1", y: 2 } }), DEFAULT_PLACEMENT);
  assert.deepEqual(
    parsePlacement({ plaque: { x: 5, y: 0.5 }, topper: { x: 0.3, y: 0.2 } }),
    { plaque: { x: 0.94, y: 0.5 }, topper: { x: 0.3, y: 0.2 } },
  );
  assert.deepEqual(
    placementPayload({ plaque: { x: 0.123456, y: 0.5 }, topper: { x: 0.2, y: 0.33339 } }),
    { plaque: { x: 0.123, y: 0.5 }, topper: { x: 0.2, y: 0.333 } },
  );
});

test("lite 3D renders at lower resolution and reports WebGL failure to the app", () => {
  const lite = cakeSceneConfig({ colour: "#FFFFFF", message: "", candles: false, reduceMotion: false, quality: "lite" });
  assert.equal(lite.quality, "lite");
  assert.equal(cakeSceneConfig({ colour: "#FFFFFF", message: "", candles: false, reduceMotion: false }).quality, "full");
  const html = cakeScene(lite);
  assert.match(html, /lite\?1\.25:2/);
  assert.match(html, /cake-webgl-unavailable/);
  assert.match(html, /webglcontextlost/);
});
