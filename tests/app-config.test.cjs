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

test("voice and Siri modules are configured for a new native runtime", () => {
  const resolved = configure({ config });
  const names = resolved.plugins.map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  );
  assert.ok(names.includes("expo-audio"));
  assert.ok(names.includes("expo-app-intents"));
  assert.ok(names.includes("./plugins/with-cakecity-shortcuts"));
  assert.ok(
    resolved.experiments.inlineModules.watchedDirectories.includes(
      "app-intents",
    ),
  );
  assert.equal(resolved.version, require("../package.json").version);
  assert.equal(resolved.runtimeVersion.policy, "appVersion");
  const audio = resolved.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio",
  )[1];
  assert.equal(audio.enableBackgroundRecording, false);
  const picker = resolved.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
  )[1];
  assert.equal(
    picker.microphonePermission,
    audio.microphonePermission,
    "Photo picker must not remove the microphone permission used by voice commands",
  );
});
