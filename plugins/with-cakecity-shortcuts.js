const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withCakeCityShortcuts(config) {
  config = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    const activity = application?.activity?.find(
      (item) => item.$["android:name"] === ".MainActivity",
    );
    if (!activity) throw new Error("Cake City shortcuts require MainActivity.");
    const entries = activity["meta-data"] ?? [];
    activity["meta-data"] = [
      ...entries.filter(
        (item) => item.$["android:name"] !== "android.app.shortcuts",
      ),
      {
        $: {
          "android:name": "android.app.shortcuts",
          "android:resource": "@xml/cakecity_shortcuts",
        },
      },
    ];
    return result;
  });
  return withDangerousMod(config, [
    "android",
    async (result) => {
      const directory = path.join(
        result.modRequest.platformProjectRoot,
        "app/src/main/res",
      );
      await fs.mkdir(path.join(directory, "xml"), { recursive: true });
      await fs.mkdir(path.join(directory, "values"), { recursive: true });
      const actions = [
        ["talk", "Talk to Cake City"],
        ["reorder", "Reorder my cake"],
        ["track", "Track my orders"],
      ];
      const intents = actions
        .map(
          ([id]) =>
            `<shortcut android:shortcutId="cakecity_${id}" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/cakecity_shortcut_${id}"><intent android:action="android.intent.action.VIEW" android:targetPackage="${result.android.package}" android:targetClass="${result.android.package}.MainActivity" android:data="cakecity://concierge?action=${id}" /></shortcut>`,
        )
        .join("\n");
      await fs.writeFile(
        path.join(directory, "xml/cakecity_shortcuts.xml"),
        `<?xml version="1.0" encoding="utf-8"?><shortcuts xmlns:android="http://schemas.android.com/apk/res/android">${intents}</shortcuts>`,
      );
      await fs.writeFile(
        path.join(directory, "values/cakecity_shortcuts.xml"),
        `<?xml version="1.0" encoding="utf-8"?><resources>${actions.map(([id, title]) => `<string name="cakecity_shortcut_${id}">${title}</string>`).join("")}</resources>`,
      );
      return result;
    },
  ]);
};
