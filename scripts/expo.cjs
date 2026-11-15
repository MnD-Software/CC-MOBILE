const path = require("node:path");
require("./windows-fs.cjs");
// Install before the CLI creates its tunnel. Private Expo hooks are feature-tested;
// the stream-based supervisor below remains a fallback for unsupported CLI versions.
let tunnelRecoveryInstalled = false;
if (process.env.CAKECITY_TUNNEL_SUPERVISOR === "1" && process.send) {
  try {
    const cliRoot = path.join(
      path.dirname(require.resolve("expo/package.json")),
      "node_modules/@expo/cli",
    );
    const { AsyncNgrok } = require(
      path.join(cliRoot, "build/src/start/server/AsyncNgrok.js"),
    );
    tunnelRecoveryInstalled =
      require("./tunnel-recovery.cjs").installTunnelRecovery(AsyncNgrok, {
        report: (message) => process.connected && process.send(message),
      });
  } catch {
    /* Version fallback: recover through the owning launcher. */
  }
}
// Keep Expo's interactive terminal intact. Tell the owning review launcher when
// the CLI reports a dead tunnel but leaves Metro running.
if (
  !tunnelRecoveryInstalled &&
  process.env.CAKECITY_TUNNEL_SUPERVISOR === "1" &&
  process.send
) {
  let reported = false;
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    let recent = "";
    stream.write = function (chunk, ...args) {
      const result = write(chunk, ...args);
      recent = (recent + String(chunk)).slice(-4096);
      if (!reported && recent.includes("Tunnel connection has been closed")) {
        reported = true;
        if (process.connected)
          process.send({ type: "cakecity:tunnel-disconnected" });
      }
      return result;
    };
  }
}
if (process.platform === "win32") {
  const preload = path.join(__dirname, "windows-fs.cjs").replace(/\\/g, "/");
  process.env.NODE_OPTIONS = (
    (process.env.NODE_OPTIONS || "") +
    " --require=" +
    JSON.stringify(preload)
  ).trim();
}
require(
  path.join(path.dirname(require.resolve("expo/package.json")), "bin/cli"),
);
