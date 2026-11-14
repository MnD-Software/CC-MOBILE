const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
test("cached image URLs follow the current preview tunnel without changing unrelated sources", () => {
  const context = {
    exports: {},
    URL,
    require: () => ({
      env: { apiUrl: "https://current.on.expo.app/__cakecity-review" },
    }),
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/app-media.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  const image = context.exports.appMedia;
  for (const host of [
    "http://127.0.0.1:8010",
    "http://192.168.0.70:8010",
    "http://10.0.0.2:8010",
    "http://172.16.0.2:8010",
    "https://old.on.expo.app/__cakecity-review",
    "https://cc-mobile-1.onrender.com",
  ])
    assert.equal(
      image(host + "/v1/app-media/source?url=original"),
      "https://current.on.expo.app/__cakecity-review/v1/app-media/source?url=original",
    );
  assert.equal(
    image("https://unrelated.example/v1/app-media/x"),
    "https://unrelated.example/v1/app-media/x",
  );
  assert.equal(image("file:///private/photo.jpg"), "file:///private/photo.jpg");
});
