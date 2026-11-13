const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const v8 = require("node:v8");
const { DiskCacheManager } = require("metro-file-map");
const {
  cacheDirectory,
  recoverSnapshot,
} = require("../scripts/metro-cache.cjs");

test("file caches are separate for project, runtime and export", () => {
  const runtime = { node: "24.13.0", v8: "13.6" };
  const directory = cacheDirectory(process.cwd(), "development", runtime);
  assert.equal(
    directory,
    cacheDirectory(process.cwd(), "development", runtime),
  );
  assert.notEqual(directory, cacheDirectory(process.cwd(), "export", runtime));
  assert.notEqual(
    directory,
    cacheDirectory(process.cwd(), "development", { ...runtime, v8: "14" }),
  );
  assert.notEqual(
    directory,
    cacheDirectory(path.join(process.cwd(), "other"), "development", runtime),
  );
});

test("damaged V8 cache rebuilds and persists a readable replacement", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "cakecity-cache-test-"),
  );
  // Delete only the two known test-owned paths, never a recursive temp directory.
  const manager = new DiskCacheManager(
    { buildParameters: { rootDir: process.cwd(), plugins: [] } },
    { cacheDirectory: directory, autoSave: false },
  );
  const file = manager.getCacheFilePath();
  t.after(async () => {
    await manager.end();
    await fs.unlink(file);
    await fs.rmdir(directory);
  });
  const notices = [];
  recoverSnapshot(manager, (notice) => notices.push(notice));
  await fs.writeFile(file, Buffer.from([0xff, 0x00, 0x01]));
  assert.equal(await manager.read(), null);
  assert.equal(notices.length, 1);
  const snapshot = {
    clocks: new Map(),
    files: new Map([["app/index.tsx", [1, 2, "hash"]]]),
  };
  await manager.write(() => snapshot, {
    changedSinceCacheRead: false,
    onWriteError: (error) => {
      throw error;
    },
  });
  assert.deepEqual(v8.deserialize(await fs.readFile(file)), snapshot);
  assert.deepEqual(await manager.read(), snapshot);
});

test("valid cache hits and unrelated filesystem errors retain their behavior", async () => {
  const snapshot = { files: new Map([["screen", 1]]) };
  const valid = recoverSnapshot(
    { read: async () => snapshot, write: async () => {} },
    () => assert.fail("unexpected recovery"),
  );
  assert.equal(await valid.read(), snapshot);
  const error = Object.assign(new Error("Access denied"), { code: "EACCES" });
  const denied = recoverSnapshot({
    read: async () => {
      throw error;
    },
    write: async () => {},
  });
  await assert.rejects(denied.read(), (actual) => actual === error);
});
