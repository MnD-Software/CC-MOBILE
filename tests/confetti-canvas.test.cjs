require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { confettiCanvasHtml } = require("../src/components/ui/confetti-canvas.ts");

test("5000-piece canvas starts once, draws a bounded burst and cancels when hidden", () => {
  const html = confettiCanvasHtml();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let draws = 0, scheduled = 0, callback, cancelled = 0;
  const events = {};
  const ctx = new Proxy({}, { get: (_, key) => key === "fillRect" ? () => draws++ : () => {}, set: () => true });
  const document = { hidden: false, getElementById: () => ({ getContext: () => ctx }), addEventListener: (key, fn) => events[key] = fn };
  const window = {};
  vm.runInNewContext(script, { window, document, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    parent: {}, addEventListener: (key, fn) => events[key] = fn, performance: { now: () => 0 },
    requestAnimationFrame: fn => { scheduled++; callback = fn; return scheduled; },
    cancelAnimationFrame: () => cancelled++ });
  window.startConfetti(0);
  window.startConfetti(0);
  assert.equal(scheduled, 1, "must not replay on a duplicate load message");
  callback(3600);
  assert.ok(draws > 1000 && draws <= 5000, `unexpected density: ${draws}`);
  document.hidden = true;
  events.visibilitychange();
  assert.equal(cancelled, 1);
  const previous = scheduled;
  callback(9001);
  assert.equal(scheduled, previous, "must not schedule forever");
  assert.ok(!/https?:\/\//.test(html), "celebration must be offline");
});
