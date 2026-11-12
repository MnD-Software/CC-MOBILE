const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function config(dev, review, host) {
  const context = {
    exports: {},
    __DEV__: dev,
    process: { env: { EXPO_PUBLIC_REVIEW_TUNNEL: review } },
    require: () => ({
      __esModule: true,
      default: { expoConfig: { hostUri: host } },
    }),
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/config/env.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports.env;
}
test("isolated Expo Go uses its Metro tunnel, production always ignores the review flag", () => {
  assert.equal(
    config(true, "1", "test.exp.direct").apiUrl,
    "https://test.exp.direct/__cakecity-review",
  );
  assert.equal(
    config(true, "1", "192.168.0.70:8084").apiUrl,
    "http://192.168.0.70:8084/__cakecity-review",
  );
  assert.equal(
    config(false, "1", "test.exp.direct").apiUrl,
    "https://cc-mobile-1.onrender.com",
  );
  assert.equal(
    config(true, "", "test.exp.direct").apiUrl,
    "https://cc-mobile-1.onrender.com",
  );
  assert.throws(() => config(true, "1", "invalid/path"), /Reopen/);
});
test("review proxy forwards only API paths to a fixed local backend and preserves session headers", () => {
  let request,
    passed = false;
  const context = {
    module: { exports: {} },
    require: () => ({
      request: (options) => {
        request = options;
        return { on() {}, destroy() {} };
      },
    }),
  };
  vm.runInNewContext(
    fs.readFileSync("scripts/review-api-proxy.cjs", "utf8"),
    context,
  );
  const proxy = context.module.exports.reviewApiProxy(() => {
    passed = true;
  });
  const res = {
    writeHead(code) {
      this.code = code;
    },
    end() {},
  };
  proxy({ url: "/other" }, res);
  assert.equal(passed, true);
  proxy({ url: "/__cakecity-review/local-preview/status" }, res);
  assert.equal(res.code, 404);
  proxy(
    {
      url: "/__cakecity-review/v1/app-orders?limit=1",
      method: "GET",
      headers: {
        authorization: "Bearer own-test-session",
        host: "attacker.example",
      },
      on() {},
      pipe() {},
    },
    res,
  );
  assert.equal(request.hostname, "127.0.0.1");
  assert.equal(request.port, 8010);
  assert.equal(request.path, "/v1/app-orders?limit=1");
  assert.equal(request.headers.authorization, "Bearer own-test-session");
  assert.equal(request.headers.host, "127.0.0.1:8010");
});
