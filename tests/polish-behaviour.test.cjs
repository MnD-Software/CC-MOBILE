require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  cardPageForPath,
  parseCardPages,
} = require("../src/features/account/card-pages.ts");
const {
  celebrationPieces,
  gracefulFall,
} = require("../src/components/ui/celebration-motion.ts");
const { installTunnelRecovery } = require("../scripts/tunnel-recovery.cjs");

test("page colour choices apply only to recognised customer pages", () => {
  assert.equal(cardPageForPath("/(tabs)/custom"), "diy");
  assert.equal(cardPageForPath("/product/chocolate"), "shop");
  assert.equal(cardPageForPath("/order/APP-123"), "orders");
  assert.equal(cardPageForPath("/workspace"), null);
  assert.equal(cardPageForPath("/sign-in"), null);
  assert.deepEqual(
    parseCardPages('{"home":true,"orders":false,"workspace":true}'),
    { home: true },
  );
  assert.deepEqual(parseCardPages("corrupt"), {});
});
test("confetti launches one full burst with a continuous slow fall", () => {
  const pieces = celebrationPieces();
  assert.equal(pieces.length, 5000);
  assert.deepEqual([...new Set(pieces.map((p) => p.burst))], [0]);
  assert.ok(Math.max(...pieces.map((p) => p.delay)) <= 0.024);
  assert.ok(pieces.every((p) => p.delay + 0.94 <= 1));
  assert.ok(Math.abs(gracefulFall(0, 400, 844)) === 0);
  assert.equal(gracefulFall(1, 400, 844), 844);
  assert.ok(
    Math.abs(
      gracefulFall(0.27999, 400, 844) - gracefulFall(0.28001, 400, 844),
    ) < 1,
  );
});
function tunnel() {
  let callback,
    timer,
    calls = 0,
    messages = [];
  const instance = {
    connect: async (options) => {
      callback = options.onStatusChange;
      callback("connected");
      return "https://same.exp.direct";
    },
    kill: async () => {
      callback?.("closed");
    },
  };
  class FakeNgrok {
    async connectToNgrokInternalAsync(client) {
      return client.connect({ onStatusChange() {} });
    }
    async _connectToNgrokAsync() {
      calls++;
      await this.stopAsync();
      return this.connectToNgrokInternalAsync(instance);
    }
    async stopAsync() {
      await instance.kill();
    }
  }
  installTunnelRecovery(FakeNgrok, {
    log() {},
    report: (m) => messages.push(m),
    schedule: (fn) => {
      timer = fn;
      return 1;
    },
    cancel: () => {
      timer = null;
    },
  });
  return {
    owner: new FakeNgrok(),
    instance,
    get callback() {
      return callback;
    },
    get timer() {
      return timer;
    },
    get calls() {
      return calls;
    },
    messages,
  };
}
test("tunnel reconnects in place and explicit shutdown cancels scheduled recovery", async () => {
  const t = tunnel();
  await t.owner._connectToNgrokAsync();
  t.callback("closed");
  const recover = t.timer;
  assert.equal(typeof recover, "function");
  await recover();
  assert.equal(t.calls, 2);
  assert.equal(t.owner.serverUrl, "https://same.exp.direct");
  assert.equal(t.messages[0].type, "cakecity:tunnel-reconnected");
  t.callback("closed");
  await t.owner.stopAsync();
  assert.equal(t.timer, null);
});
