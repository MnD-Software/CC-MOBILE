// Explicit no-money Expo Go session, using Metro's tunnel for the isolated API.
const { spawn } = require("node:child_process");
const path = require("node:path");
async function main() {
  const response = await fetch("http://127.0.0.1:8010/local-preview/status", {
    signal: AbortSignal.timeout(5000),
  });
  const status = await response.json();
  if (
    !response.ok ||
    status.local_preview !== true ||
    status.live_integrations !== false
  )
    throw new Error(
      "Start the isolated backend with npm run preview:local first.",
    );
  console.log(
    "Isolated Expo Go checkout: no real charges. Use the local admin account in artifacts/local-preview/LOGIN.txt.",
  );
  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, "expo.cjs"),
      "start",
      "--go",
      "--tunnel",
      "--port",
      "8084",
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: "",
        EXPO_PUBLIC_REVIEW_TUNNEL: "1",
        EXPO_PUBLIC_LOCAL_REVIEW: "1",
        EXPO_PUBLIC_PURCHASE_TEST_URL: "",
        CAKECITY_REVIEW_PROXY: "1",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
main().catch(() => {
  console.error(
    "Isolated review backend is unavailable. Run npm run preview:local first.",
  );
  process.exitCode = 1;
});
