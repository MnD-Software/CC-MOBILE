// Normal Expo Go preview uses app checkout. The simulator is an explicit tool.
const { spawn } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
delete env.EXPO_PUBLIC_LOCAL_REVIEW;
delete env.EXPO_PUBLIC_PURCHASE_TEST_URL;
const child = spawn(
  process.execPath,
  [
    path.join(__dirname, "expo.cjs"),
    "start",
    "--go",
    "--lan",
    ...process.argv.slice(2),
  ],
  {
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
