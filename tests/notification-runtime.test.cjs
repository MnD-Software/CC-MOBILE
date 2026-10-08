const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const source = ts.transpileModule(
  fs.readFileSync("src/native/notification-runtime.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function load(platform, expoGo, fails = false) {
  const calls = [];
  const runtime = { mock: true };
  const context = {
    exports: {},
    require(name) {
      if (name === "expo") return { isRunningInExpoGo: () => expoGo };
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "expo-notifications") {
        calls.push(name);
        if (fails) throw new Error("Native module unavailable");
        return runtime;
      }
      throw new Error("Unexpected import: " + name);
    },
  };
  vm.runInNewContext(source, context);
  return { get: context.exports.getNativeNotifications, calls, runtime };
}
test("Android Expo Go and browser never evaluate the throwing notification entrypoint", () => {
  for (const platform of ["android", "web"]) {
    const value = load(platform, true, true);
    assert.equal(value.get(), null);
    assert.deepEqual(value.calls, []);
  }
});
test("installed Android and iOS load notifications once and retain the real API", () => {
  for (const [platform, expoGo] of [
    ["android", false],
    ["ios", false],
    ["ios", true],
  ]) {
    const value = load(platform, expoGo);
    assert.equal(value.get(), value.runtime);
    assert.equal(value.get(), value.runtime);
    assert.equal(value.calls.length, 1);
  }
});
test("an unavailable optional notification module cannot crash startup or retry forever", () => {
  const value = load("android", false, true);
  assert.equal(value.get(), null);
  assert.equal(value.get(), null);
  assert.equal(value.calls.length, 1);
});
test("app notification integrations import the runtime guard before evaluating native APIs", () => {
  for (const name of [
    "NotificationObserver.tsx",
    "celebration-reminders.tsx",
    "notifications.ts",
    "order-tracking-notification.ts",
  ]) {
    const file = ts.createSourceFile(
      name,
      fs.readFileSync("src/native/" + name, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const node of file.statements) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === "expo-notifications"
      )
        assert.equal(
          node.importClause.isTypeOnly,
          true,
          name + " must not evaluate the notification package at startup",
        );
    }
  }
});
