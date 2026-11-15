// One command owns the isolated API and Expo Go tunnel.
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const children = [];
let stopping = false;
let tunnelGeneration = 0;
let retryTimer;
const root = path.resolve(__dirname, "..");
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(retryTimer);
  tunnelGeneration++;
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
function launch(args, env = process.env, onExit) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: onExit ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      if (onExit) onExit(code, signal);
      else stop(code ?? 1);
    }
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
async function saveQr(port, generation) {
  for (
    let attempts = 0;
    attempts < 360 && !stopping && generation === tunnelGeneration;
    attempts++
  ) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "expo-platform": "ios", accept: "application/expo+json" },
        signal: AbortSignal.timeout(15000),
      });
      const host = (await response.json()).extra?.expoClient?.hostUri;
      if (stopping || generation !== tunnelGeneration) return;
      if (
        !response.ok ||
        !host ||
        !/^[a-zA-Z0-9.:-]+$/.test(host) ||
        /^(?:localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?::1)/i.test(host)
      )
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
  if (!stopping && generation === tunnelGeneration)
    console.error(
      "Could not save the tunnel QR. Use the current URL shown by Expo in this terminal.",
    );
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
  const args = [
    path.join(__dirname, "expo.cjs"),
    "start",
    "--go",
    "--tunnel",
    ...(portIndex < 0 ? ["--port", String(port)] : []),
    "--max-workers",
    "2",
    ...extra,
  ];
  const env = {
    ...process.env,
    EXPO_PUBLIC_API_URL: "",
    EXPO_PUBLIC_REVIEW_TUNNEL: "1",
    EXPO_PUBLIC_LOCAL_REVIEW: "1",
    EXPO_PUBLIC_PURCHASE_TEST_URL: "",
    CAKECITY_REVIEW_PROXY: "1",
    CAKECITY_TUNNEL_SUPERVISOR: "1",
  };
  let failures = 0;
  function startTunnel() {
    if (stopping) return;
    const generation = ++tunnelGeneration;
    const started = Date.now();
    const child = launch(args, env, (code, signal) => {
      tunnelGeneration++;
      // An intentional CLI exit (q/Ctrl+C) should never restart the session.
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM")
        return stop();
      if (Date.now() - started > 120000) failures = 0;
      if (++failures > 5) {
        console.error(
          "Expo stopped repeatedly. Check the error above and your internet connection, then run npm run start:go:tunnel again.",
        );
        return stop(1);
      }
      const delay = Math.min(30000, 3000 * 2 ** (failures - 1));
      console.error(
        `Expo tunnel stopped (${signal || code}). Reconnecting in ${delay / 1000}s (${failures}/5). The test backend stays running. Ctrl+C cancels.`,
      );
      retryTimer = setTimeout(startTunnel, delay);
    });
    let disconnected = false;
    child.on("message", (message) => {
      if (!stopping && message?.type === "cakecity:tunnel-reconnected") {
        void saveQr(port, generation);
        return;
      }
      if (
        stopping ||
        disconnected ||
        message?.type !== "cakecity:tunnel-disconnected"
      )
        return;
      disconnected = true;
      // The CLI may leave Metro alive after losing its public tunnel.
      if (process.platform === "win32" && child.pid)
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGKILL");
    });
    void saveQr(port, generation);
  }
  startTunnel();
}
main().catch((error) => {
  console.error(error.message);
  stop(1);
});
