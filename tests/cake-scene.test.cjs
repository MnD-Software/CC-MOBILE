require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {
  cakeLook,
  cakeWeightKg,
  cakeSceneConfig,
  cakeSceneUpdate,
  cakeScene,
  sceneJson,
} = require("../src/features/studio/cake-scene.ts");

test("flavour names choose an illustrative look without inventing products", () => {
  assert.equal(cakeLook("Black Forest Gateau").fruit, "cherry");
  assert.equal(cakeLook("Chocolate Fudge").drip, "#3A1D14");
  assert.equal(cakeLook("Salted Caramel").drip, "#B26A28");
  assert.equal(cakeLook("Red Velvet").sponge, "#9A2431");
  assert.equal(cakeLook("Strawberry Delight").fruit, "strawberry");
  assert.deepEqual(cakeLook(null), cakeLook("Plain Vanilla"));
  assert.equal(cakeLook("Vanilla").drip, null);
});

test("inventory sizes become a bounded weight and ignore malformed attributes", () => {
  assert.equal(cakeWeightKg([{ value: "1 Kg" }]), 1);
  assert.equal(cakeWeightKg([{ value: "1.5kg" }]), 1.5);
  assert.equal(cakeWeightKg([{ value: "Half kg" }]), 0.5);
  assert.equal(cakeWeightKg([{ value: "500 g" }]), 0.5);
  assert.equal(cakeWeightKg([{ value: null }, { value: "Buttercream" }]), null);
  assert.equal(cakeWeightKg(null), null);
  assert.equal(cakeSceneConfig({ colour: "#FFFFFF", message: "", candles: false, reduceMotion: false, sizeKg: 40 }).sizeKg, 6);
  assert.equal(cakeSceneConfig({ colour: "#FFFFFF", message: "", candles: false, reduceMotion: false }).sizeKg, 1);
});

test("scene config rejects unsafe colours and long messages", () => {
  const config = cakeSceneConfig({
    colour: "red;}</script>",
    message: "x".repeat(80),
    candles: true,
    reduceMotion: true,
    backdrop: ["#FFF", "javascript:"],
  });
  assert.equal(config.colour, "#FFF8EE");
  assert.equal(config.message.length, 32);
  assert.deepEqual(config.backdrop, ["#FFFFFF", "#F6E9EF"]);
});

test("customer text cannot break out of the inline script or injected update", () => {
  const config = cakeSceneConfig({
    colour: "#FFFFFF",
    message: "</script><b>hi" + String.fromCharCode(0x2028),
    candles: false,
    reduceMotion: true,
  });
  const json = sceneJson(config);
  assert.doesNotMatch(json, /<\/script>/i);
  assert.ok(!json.includes(String.fromCharCode(0x2028)));
  assert.deepEqual(JSON.parse(json), config);
  const html = cakeScene({ ...config, flavour: "Vanilla" });
  assert.equal(html.match(/<\/script>/g).length, 1);
  let received = null;
  vm.runInNewContext(cakeSceneUpdate(config), {
    window: { cakeUpdate: (value) => (received = value) },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(received)), config);
});

test("the embedded renderer is syntactically valid and stays offline", () => {
  const html = cakeScene({
    colour: "#F7B6D2",
    message: "Happy Birthday",
    candles: true,
    sprinkles: true,
    flavour: "Black Forest",
    sizeKg: 2,
    slice: true,
    reduceMotion: false,
  });
  const script = html.slice(
    html.indexOf("<script>") + 8,
    html.lastIndexOf("</script>"),
  );
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /design illustration/i);
});
