// Local phone review: separate simulator/database, no real checkout writes.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { randomBytes, randomInt } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "artifacts", "purchase-test");
const portOption = process.argv.indexOf("--port");
const metroPort = portOption < 0 ? 8083 : Number(process.argv[portOption + 1]);
if (!Number.isInteger(metroPort) || metroPort < 1024 || metroPort > 65535)
  throw new Error("Use --port with an available port between 1024 and 65535.");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid && child.exitCode === null)
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
function launch(executable, args, options) {
  const child = spawn(executable, args, { windowsHide: true, ...options });
  children.push(child);
  child.on("error", (error) => {
    process.stderr.write(error.message + "\n");
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.stderr.write(
        "Test preview process stopped. Check artifacts/purchase-test logs.\n",
      );
      stop(code || 1);
    }
  });
  return child;
}
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied. Stop the previous purchase test first.`,
        ),
      ),
    );
    server.listen(port, "0.0.0.0", () => server.close(resolve));
  });
}
async function ready(url, validate) {
  const end = Date.now() + 300000;
  while (!stopping && Date.now() < end) {
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (result.ok && (await validate(result))) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Test preview did not start. See artifacts/purchase-test logs.",
  );
}
function qrModules(url) {
  const cli = path.join(
    path.dirname(require.resolve("expo/package.json")),
    "node_modules",
    "@expo",
    "cli",
  );
  const { toQR } = require(require.resolve("toqr", { paths: [cli] }));
  return toQR(url);
}
function printTerminalQr(url) {
  const modules = qrModules(url);
  const count = Math.sqrt(modules.length);
  const border = 4;
  const dark = (x, y) =>
    x >= 0 && x < count && y >= 0 && y < count && modules[y * count + x];
  for (let y = -border; y < count + border; y += 2) {
    let row = "";
    for (let x = -border; x < count + border; x++) {
      const top = dark(x, y);
      const bottom = dark(x, y + 1);
      row += top ? (bottom ? "█" : "▀") : bottom ? "▄" : " ";
    }
    process.stdout.write(`\x1b[30;107m${row}\x1b[0m\n`);
  }
}
function qrImage(url) {
  const modules = qrModules(url),
    count = Math.sqrt(modules.length),
    scale = 10,
    border = 4,
    size = (count + border * 2) * scale;
  const raw = Buffer.alloc((size + 1) * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - border,
        col = Math.floor(x / scale) - border;
      if (
        row >= 0 &&
        row < count &&
        col >= 0 &&
        col < count &&
        modules[row * count + col]
      )
        raw[y * (size + 1) + x + 1] = 0;
    }
  }
  function chunk(type, data) {
    const name = Buffer.from(type),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([name, data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, name, data, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", require("node:zlib").deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function main() {
  process.stdout.write(
    "Starting Expo Go with simulated payments. No real money moves.\n",
  );
  await available(8011);
  await available(metroPort);
  const addresses = Object.entries(os.networkInterfaces())
    .filter(([name]) => !/vEthernet|VirtualBox|VMware|WSL|Loopback/i.test(name))
    .flatMap(([, entries]) => entries || [])
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  const host =
    process.env.CAKECITY_TEST_HOST ||
    addresses.find((value) => value.startsWith("192.168.")) ||
    addresses.find((value) => value.startsWith("10.")) ||
    addresses.find((value) => /^172\.(1[6-9]|2\d|3[01])\./.test(value));
  if (
    !host ||
    !/^(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      host,
    )
  )
    throw new Error(
      "Connect to Wi-Fi, or set CAKECITY_TEST_HOST to this computer's private LAN address.",
    );
  fs.mkdirSync(directory, { recursive: true });
  const secretsFile = path.join(directory, "private-settings.json");
  if (!fs.existsSync(secretsFile))
    fs.writeFileSync(
      secretsFile,
      JSON.stringify({
        code: String(randomInt(10000000, 100000000)),
        access: randomBytes(48).toString("base64url"),
        webhook: randomBytes(48).toString("base64url"),
      }),
      { mode: 0o600 },
    );
  const secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
  fs.writeFileSync(
    path.join(directory, "TEST-ACCESS.txt"),
    `LOCAL TEST ACCOUNT ONLY\n\nEnter this eight-digit code in the purchase test:\n${secrets.code}\n\nNo real payments or real loyalty points. Do not commit these local test settings.\n`,
    { mode: 0o600 },
  );
  const validation = path.join(
    root,
    "artifacts",
    "validation-environment-2026-10-22.txt",
  );
  const candidates = [
    process.env.CAKECITY_PREVIEW_PYTHON,
    fs.existsSync(validation)
      ? path.join(
          fs.readFileSync(validation, "utf8").trim(),
          "Scripts",
          "python.exe",
        )
      : null,
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(root, ".venv", "bin", "python"),
  ];
  const python = candidates.find((value) => value && fs.existsSync(value));
  if (!python)
    throw new Error(
      "Set CAKECITY_PREVIEW_PYTHON to an environment containing backend/requirements.txt.",
    );
  const env = { ...process.env, EXPO_NO_DOTENV: "1" };
  delete env.CAKECITY_BUILD_PROFILE;
  delete env.EAS_BUILD_PROFILE;
  delete env.CI;
  process.stdout.write("Starting the test-payment service on port 8011...\n");
  const backendLog = fs.openSync(path.join(directory, "backend.log"), "a");
  launch(
    python,
    [
      "-m",
      "uvicorn",
      "app.payment_sandbox:create_sandbox_app",
      "--factory",
      "--host",
      "0.0.0.0",
      "--port",
      "8011",
      "--no-access-log",
      "--no-proxy-headers",
    ],
    {
      cwd: path.join(root, "backend"),
      stdio: ["ignore", backendLog, backendLog],
      env: {
        ...env,
        ENVIRONMENT: "development",
        PAYMENT_SANDBOX_ENABLED: "true",
        PAYMENT_SANDBOX_ISOLATED: "true",
        PAYMENT_SANDBOX_DATABASE_URL:
          "sqlite:///" +
          path.join(directory, "payment-sandbox-review.db").replace(/\\/g, "/"),
        PAYMENT_SANDBOX_ACCESS_TOKEN: secrets.access,
        PAYMENT_SANDBOX_WEBHOOK_SECRET: secrets.webhook,
        PAYMENT_SANDBOX_MOBILE_REVIEW_ENABLED: "true",
        PAYMENT_SANDBOX_MOBILE_PAIRING_CODE: secrets.code,
        PAYMENT_SANDBOX_MOBILE_ORIGINS: `http://localhost:${metroPort},http://127.0.0.1:${metroPort},http://${host}:${metroPort}`,
      },
    },
  );
  await ready(
    "http://127.0.0.1:8011/health",
    async (response) => (await response.json()).simulated === true,
  );
  process.stdout.write(
    `Test-payment service ready. Starting Expo Go on port ${metroPort}...\nStartup can take a few minutes in this OneDrive workspace.\n`,
  );
  const metroLog = fs.openSync(path.join(directory, "metro.log"), "a");
  const metro = launch(
    process.execPath,
    [
      "scripts/expo.cjs",
      "start",
      "--go",
      "--lan",
      "--port",
      String(metroPort),
      "--max-workers",
      "2",
    ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        REACT_NATIVE_PACKAGER_HOSTNAME: host,
        EXPO_PUBLIC_API_URL: "https://cc-mobile-1.onrender.com",
        EXPO_PUBLIC_LOCAL_REVIEW: "1",
        EXPO_PUBLIC_PURCHASE_TEST_URL: `http://${host}:8011`,
        METRO_FILE_MAP_MAX_WAIT_TIME: "240000",
      },
    },
  );
  for (const [stream, output] of [
    [metro.stdout, process.stdout],
    [metro.stderr, process.stderr],
  ])
    stream.on("data", (data) => {
      fs.writeSync(metroLog, data);
      output.write(data);
    });
  await ready(`http://127.0.0.1:${metroPort}/status`, async (response) =>
    (await response.text()).includes("packager-status:running"),
  );
  const expoUrl = `exp://${host}:${metroPort}/--/checkout`;
  fs.writeFileSync(path.join(directory, "iphone-qr.png"), qrImage(expoUrl));
  fs.writeFileSync(
    path.join(directory, "RUNNING.json"),
    JSON.stringify(
      {
        pid: process.pid,
        host,
        expoUrl,
        webUrl: `http://localhost:${metroPort}/checkout`,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    "\nExpo Go is ready. Scan this QR with your iPhone camera:\n\n",
  );
  printTerminalQr(expoUrl);
  process.stdout.write(
    `\nExpo Go: ${expoUrl}\nBrowser: http://localhost:${metroPort}/checkout\nQR image: artifacts/purchase-test/iphone-qr.png\nPrivate test code: artifacts/purchase-test/TEST-ACCESS.txt\nBundling starts when your iPhone opens the app; bundle progress appears here.\nKeep this terminal running. Ctrl+C stops both test services.\n`,
  );
}
main().catch((error) => {
  process.stderr.write(error.message + "\n");
  stop(1);
});
