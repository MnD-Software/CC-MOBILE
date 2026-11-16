require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  plaqueStyle,
  candleStripe,
  pipingSize,
  clampPoint,
  printFrame,
  clampPan,
  sprinkleField,
  luminance,
  plaqueWidth,
} = require("../src/features/studio/real-cake.ts");
const { cakeWeightKg } = require("../src/features/studio/cake-scene.ts");

test("piped message keeps contrast against its plaque", () => {
  // Light icing goes on dark chocolate, dark icing on white chocolate.
  assert.equal(plaqueStyle("#FFFFFF").surface[0], "#8A5640");
  assert.equal(plaqueStyle("#FFF3D6").surface[0], "#8A5640");
  assert.equal(plaqueStyle("#85523F").surface[0], "#FFFDF7");
  assert.equal(plaqueStyle("#EC008C").surface[0], "#FFFDF7");
  assert.equal(plaqueStyle("not a colour").ink, "#EC008C");
  assert.equal(candleStripe("#FFFFFF"), "#EC008C");
  assert.equal(candleStripe("#85523f"), "#85523F");
  assert.ok(luminance("#FFFFFF") > 0.99 && luminance("#000000") < 0.01);
});

test("message size shrinks with length and stays legible", () => {
  const short = pipingSize("Hi", 140),
    long = pipingSize("Happy 30th Birthday Grandma Wanjiru", 140);
  assert.ok(short > long);
  assert.ok(long >= 8);
  assert.ok(short <= 140 * 0.13);
  // Two lines of the longest message must fit the plaque (height 0.38 x width).
  assert.ok(pipingSize("x".repeat(32), 140) * 1.08 * 2 <= 140 * 0.38 * 0.8);
});

test("plaque widens for longer messages within the cake", () => {
  assert.ok(plaqueWidth("Hi", 300) < plaqueWidth("Happy 30th Amani", 300));
  assert.equal(plaqueWidth("x".repeat(32), 300), 156);
  assert.equal(plaqueWidth("Hi", 100), 72);
});

test("print fills a short stage and placements stay on the photo", () => {
  assert.deepEqual(printFrame(360, 200), { size: 224, left: 68, top: -12 });
  assert.deepEqual(printFrame(360, 420), { size: 360, left: 0, top: 30 });
  assert.deepEqual(clampPoint({ x: -1, y: 2 }), { x: 0.06, y: 0.94 });
  assert.deepEqual(clampPoint({ x: NaN, y: 0.3 }), { x: 0.5, y: 0.3 });
  assert.equal(Math.round(clampPan(500, 1.9, 200)), 90);
  assert.equal(Math.round(clampPan(-500, 1.9, 200)), -90);
  assert.equal(clampPan(40, 1, 200), 0);
});

test("sprinkles scatter inside the cake top deterministically", () => {
  const field = sprinkleField();
  assert.equal(field.length, 42);
  assert.deepEqual(field, sprinkleField());
  for (const s of field)
    assert.ok((s.x / 0.15) ** 2 + (s.y / 0.042) ** 2 <= 1.0001);
});

test("catalogue size slugs parse as decimal kilograms", () => {
  assert.equal(cakeWeightKg([{ value: "2-5kg-serves-25" }]), 2.5);
  assert.equal(cakeWeightKg([{ value: "2kg-serves-20" }]), 2);
  assert.equal(cakeWeightKg([{ value: "1,5 Kg" }]), 1.5);
  assert.equal(cakeWeightKg([{ value: "Half kg" }]), 0.5);
});
