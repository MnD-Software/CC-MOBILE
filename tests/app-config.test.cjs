const { test } = require("node:test");
const assert = require("node:assert/strict");
const configure = require("../app.config.js");
const config = require("../app.json").expo;

test("resolved Expo configuration preserves iOS extension provisioning metadata", () => {
  const resolved = configure({ config });
  assert.deepEqual(resolved.extra.eas.build, config.extra.eas.build);
  assert.equal(resolved.extra.eas.projectId, config.extra.eas.projectId);
  assert.ok(
    resolved.plugins.some(
      (value) => Array.isArray(value) && value[0] === "expo-widgets",
    ),
  );
});
