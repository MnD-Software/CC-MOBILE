// Local-only review runner. No secrets from .env files or hosted databases.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "artifacts", "local-preview");
const apiUrl = "http://127.0.0.1:8010";
const webUrl = "http://localhost:8082";
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid && child.exitCode === null) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else child.kill();
  }
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

function launch(executable, args, options) {
  const child = spawn(executable, args, { windowsHide: true, ...options });
  children.push(child);
  child.on("error", (error) => {
    process.stderr.write(`Preview process could not start: ${error.message}\n`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.stderr.write(
        `Preview process exited (${code}). Check artifacts/local-preview logs.\n`,
      );
      stop(code || 1);
    }
  });
  return child;
}

async function available(port, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied; this preview will not replace another service.`,
        ),
      ),
    );
    socket.listen(port, host, () => socket.close(resolve));
  });
}

async function ready(url, timeoutMs, validate = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await validate(response))) return;
    } catch {
      /* backend startup or Metro compilation is still in progress */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Preview did not become ready: ${url}. Check artifacts/local-preview logs.`,
  );
}

async function main() {
  await available(8010);
  await available(8082, "localhost");
  fs.mkdirSync(directory, { recursive: true });
  const candidates = [];
  if (process.env.CAKECITY_PREVIEW_PYTHON)
    candidates.push(process.env.CAKECITY_PREVIEW_PYTHON);
  const environmentFile = path.join(
    root,
    "artifacts",
    "validation-environment-2026-10-22.txt",
  );
  if (fs.existsSync(environmentFile)) {
    candidates.push(
      path.join(
        fs.readFileSync(environmentFile, "utf8").trim(),
        "Scripts",
        "python.exe",
      ),
    );
  }
  candidates.push(path.join(root, ".venv", "Scripts", "python.exe"));
  candidates.push(path.join(root, ".venv", "bin", "python"));
  const python = candidates.find((candidate) => fs.existsSync(candidate));
  if (!python)
    throw new Error(
      "Create a Python environment from backend/requirements.txt and set CAKECITY_PREVIEW_PYTHON to its python executable.",
    );
  const credentialsFile = path.join(directory, "credentials.json");
  if (!fs.existsSync(credentialsFile)) {
    const accounts = Object.fromEntries(
      ["customer", "admin"].map((role) => [
        role,
        {
          email: `${role}@preview.example.com`,
          password: randomBytes(24).toString("base64url"),
        },
      ]),
    );
    fs.writeFileSync(
      credentialsFile,
      JSON.stringify({ localOnly: true, accounts }, null, 2),
      { mode: 0o600 },
    );
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
  const loginNotes = [
    "LOCAL REVIEW ACCOUNTS — this computer only",
    "",
    ...Object.entries(credentials.accounts).flatMap(([role, account]) => [
      role,
      `Email: ${account.email}`,
      `Password: ${account.password}`,
      "",
    ]),
  ].join("\n");
  fs.writeFileSync(path.join(directory, "LOGIN.txt"), loginNotes, {
    mode: 0o600,
  });
  const sharedEnvironment = { ...process.env, EXPO_NO_DOTENV: "1" };
  // Strip inherited build-profile guards; this is deliberately a dev preview.
  delete sharedEnvironment.CAKECITY_BUILD_PROFILE;
  delete sharedEnvironment.EAS_BUILD_PROFILE;
  const backendEnvironment = {
    ...sharedEnvironment,
    ENVIRONMENT: "development",
    DATABASE_URL:
      "sqlite:///" + path.join(directory, "review.db").replace(/\\/g, "/"),
    DATABASE_URL_UNPOOLED: "",
    JWT_SECRET: randomBytes(48).toString("base64url"),
    CORS_ORIGINS: webUrl,
    REDIS_URL: "",
    WOOCOMMERCE_CONSUMER_KEY: "",
    WOOCOMMERCE_CONSUMER_SECRET: "",
    WOOCOMMERCE_WEBHOOK_SECRET: "",
    CLUB_EVENT_SECRET: "",
    CAKECITY_LOCAL_PREVIEW_DIR: directory,
  };
  const backendLog = fs.openSync(path.join(directory, "backend.log"), "a");
  launch(
    python,
    [
      "-m",
      "uvicorn",
      "app.local_preview:create_app",
      "--factory",
      "--host",
      "127.0.0.1",
      "--port",
      "8010",
      "--no-access-log",
    ],
    {
      cwd: path.join(root, "backend"),
      env: backendEnvironment,
      stdio: ["ignore", backendLog, backendLog],
    },
  );
  await ready(
    apiUrl + "/local-preview/status",
    45000,
    async (response) => (await response.json()).local_preview === true,
  );
  const webLog = fs.openSync(path.join(directory, "web.log"), "a");
  launch(
    process.execPath,
    [
      "scripts/expo.cjs",
      "start",
      "--web",
      "--host",
      "localhost",
      "--port",
      "8082",
      "--max-workers",
      "2",
    ],
    {
      cwd: root,
      env: {
        ...sharedEnvironment,
        EXPO_PUBLIC_API_URL: apiUrl,
        EXPO_PUBLIC_LOCAL_REVIEW: "1",
        METRO_FILE_MAP_MAX_WAIT_TIME: "240000",
        CI: "1",
      },
      stdio: ["ignore", webLog, webLog],
    },
  );
  await ready(webUrl + "/sign-in", 120000);
  fs.writeFileSync(
    path.join(directory, "RUNNING.json"),
    JSON.stringify(
      { startedAt: new Date().toISOString(), apiUrl, webUrl, pid: process.pid },
      null,
      2,
    ),
  );
  process.stdout.write(
    `Local preview ready.\nCorporate: ${webUrl}/corporate\nCommand Center: ${webUrl}/command-center\nSign in: ${webUrl}/sign-in\nLocal account passwords: artifacts/local-preview/LOGIN.txt\nThis preview uses a separate local database. Website checkout is disabled.\nKeep this terminal running. Ctrl+C stops both preview services.\n`,
  );
}
main().catch((error) => {
  process.stderr.write(error.message + "\n");
  stop(1);
});
