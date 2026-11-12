// One command owns the isolated API and Expo Go tunnel.
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const children = [];
let stopping = false;
const root = path.resolve(__dirname, "..");
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32" && child.pid)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill();
  }
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function launch(args, env = process.env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
}
async function backendReady() {
  try {
    const response = await fetch("http://127.0.0.1:8010/local-preview/status", {
      signal: AbortSignal.timeout(2000),
    });
    const status = await response.json();
    return (
      response.ok &&
      status.local_preview === true &&
      status.live_integrations === false
    );
  } catch {
    return false;
  }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function saveQr(port) {
  for (let attempts = 0; attempts < 360 && !stopping; attempts++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "expo-platform": "ios", accept: "application/expo+json" },
        signal: AbortSignal.timeout(2000),
      });
      const host = (await response.json()).extra?.expoClient?.hostUri;
      if (!response.ok || !host || !/^[a-zA-Z0-9.:-]+$/.test(host))
        throw new Error("Tunnel starting");
      const url = "exp://" + host;
      const cli = path.join(
        path.dirname(require.resolve("expo/package.json")),
        "node_modules/@expo/cli",
      );
      const { toQR } = require(require.resolve("toqr", { paths: [cli] }));
      const cells = toQR(url),
        side = Math.sqrt(cells.length);
      let rectangles = "";
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++)
          if (cells[y * side + x])
            rectangles += `<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`;
      const directory = path.join(root, "artifacts/local-preview");
      fs.writeFileSync(
        path.join(directory, "EXPO-GO-REVIEW-QR.svg"),
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 ${side + 8} ${side + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${rectangles}</g></svg>`,
      );
      fs.writeFileSync(path.join(directory, "EXPO-GO-REVIEW-URL.txt"), url);
      console.log(
        "Current QR saved: artifacts/local-preview/EXPO-GO-REVIEW-QR.svg",
      );
      return;
    } catch {
      await pause(1000);
    }
  }
}
async function main() {
  const extra = process.argv.slice(2);
  const portIndex = extra.indexOf("--port");
  const port = portIndex < 0 ? 8084 : Number(extra[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(
      "Use --port with an available port between 1024 and 65535.",
    );
  if (!(await backendReady())) {
    console.log("Starting the isolated test backend...");
    launch([path.join(__dirname, "local-preview.cjs"), "--api-only"]);
    let ready = false;
    for (let attempts = 0; attempts < 180 && !stopping; attempts++) {
      if (await backendReady()) {
        ready = true;
        break;
      }
      await pause(1000);
    }
    if (stopping) return;
    if (!ready)
      throw new Error(
        "Test backend did not start. Check artifacts/local-preview/backend.log.",
      );
  }
  if (stopping) return;
  console.log(
    "Isolated Expo Go checkout: no real charges. Sign-in: artifacts/local-preview/LOGIN.txt. Ctrl+C stops this session.",
  );
  launch(
    [
      path.join(__dirname, "expo.cjs"),
      "start",
      "--go",
      "--tunnel",
      ...(portIndex < 0 ? ["--port", String(port)] : []),
      "--max-workers",
      "2",
      ...extra,
    ],
    {
      ...process.env,
      EXPO_PUBLIC_API_URL: "",
      EXPO_PUBLIC_REVIEW_TUNNEL: "1",
      EXPO_PUBLIC_LOCAL_REVIEW: "1",
      EXPO_PUBLIC_PURCHASE_TEST_URL: "",
      CAKECITY_REVIEW_PROXY: "1",
    },
  );
  void saveQr(port);
}
main().catch((error) => {
  console.error(error.message);
  stop(1);
});
