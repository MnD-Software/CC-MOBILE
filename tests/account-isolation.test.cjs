require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// In-memory AsyncStorage so the real persisted stores can run under node.
const disk = new Map();
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@react-native-async-storage/async-storage")
    return {
      __esModule: true,
      default: {
        getItem: async (key) => disk.get(key) ?? null,
        setItem: async (key, value) => {
          disk.set(key, value);
        },
        removeItem: async (key) => {
          disk.delete(key);
        },
      },
    };
  return originalLoad.call(this, request, ...rest);
};
const {
  useBag,
  usePreferences,
  claimDeviceState,
  releaseDeviceState,
  selectSavedSlugs,
  selectRecentSearches,
  selectHiddenTracking,
} = require("../src/features/commerce/store.ts");
const {
  validatedPreferences,
} = require("../src/features/commerce/preference-validation.ts");
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("closing the Home tracking card hides only that order, only for that account", () => {
  claimDeviceState("alice");
  const { hideTracking } = usePreferences.getState();
  hideTracking("APP-1");
  hideTracking("APP-1");
  assert.deepEqual(selectHiddenTracking(usePreferences.getState()), ["APP-1"]);
  claimDeviceState("bob");
  assert.deepEqual(selectHiddenTracking(usePreferences.getState()), []);
  releaseDeviceState();
  usePreferences.getState().hideTracking("APP-2"); // signed out: no-op
  claimDeviceState("alice");
  assert.deepEqual(selectHiddenTracking(usePreferences.getState()), ["APP-1"]);
  // Survives a restart's validation; corrupt entries are dropped, not crashed on.
  assert.deepEqual(
    validatedPreferences({ hiddenTrackingByOwner: { alice: ["APP-1"], bob: "bad" } })
      .hiddenTrackingByOwner,
    { alice: ["APP-1"] },
  );
});

test("a bag never follows sign-out or a different account", () => {
  claimDeviceState("alice");
  useBag.setState({
    lines: [{ key: "cake", slug: "cake" }],
    settled: ["checkout-1"],
  });
  claimDeviceState("alice");
  assert.equal(useBag.getState().lines.length, 1);
  claimDeviceState("bob");
  assert.deepEqual(useBag.getState().lines, []);
  assert.deepEqual(useBag.getState().settled, []);
  useBag.setState({ lines: [{ key: "x", slug: "cake" }] });
  releaseDeviceState();
  assert.deepEqual(useBag.getState().lines, []);
  assert.equal(useBag.getState().owner, null);
});

test("a late bag hydration cannot restore another account's lines", async () => {
  disk.set(
    "cakecity.bag.v3",
    JSON.stringify({
      state: { owner: "alice", lines: [], settled: ["alice-order"] },
      version: 0,
    }),
  );
  claimDeviceState("bob");
  await useBag.persist.rehydrate();
  assert.equal(useBag.getState().owner, "bob");
  assert.deepEqual(useBag.getState().settled, []);
  // A legacy ownerless bag is dropped rather than adopted.
  disk.set(
    "cakecity.bag.v3",
    JSON.stringify({ state: { lines: [], settled: ["legacy"] }, version: 0 }),
  );
  await useBag.persist.rehydrate();
  assert.deepEqual(useBag.getState().settled, []);
  releaseDeviceState();
});

test("favourites and searches are kept per account and hidden when signed out", () => {
  claimDeviceState("alice");
  usePreferences.getState().toggleSavedProduct("rose-cake");
  usePreferences.getState().search("vanilla");
  assert.deepEqual(selectSavedSlugs(usePreferences.getState()), ["rose-cake"]);
  claimDeviceState("bob");
  assert.deepEqual(selectSavedSlugs(usePreferences.getState()), []);
  assert.deepEqual(selectRecentSearches(usePreferences.getState()), []);
  releaseDeviceState();
  usePreferences.getState().toggleSavedProduct("guest-cake");
  assert.deepEqual(selectSavedSlugs(usePreferences.getState()), []);
  claimDeviceState("alice");
  assert.deepEqual(selectSavedSlugs(usePreferences.getState()), ["rose-cake"]);
  assert.deepEqual(selectRecentSearches(usePreferences.getState()), [
    "vanilla",
  ]);
  // Stable references keep zustand selectors from re-rendering forever.
  claimDeviceState("carol");
  assert.equal(
    selectSavedSlugs(usePreferences.getState()),
    selectSavedSlugs(usePreferences.getState()),
  );
  releaseDeviceState();
});

test("legacy device-global favourites are dropped, not handed to the next sign-in", async () => {
  disk.set(
    "cakecity.preferences.v3",
    JSON.stringify({
      state: {
        savedProductSlugs: ["someone-elses-cake"],
        recentSearches: ["private search"],
        designs: {},
      },
      version: 1,
    }),
  );
  await usePreferences.persist.rehydrate();
  await turn();
  claimDeviceState("dave");
  const state = usePreferences.getState();
  assert.deepEqual(selectSavedSlugs(state), []);
  assert.deepEqual(selectRecentSearches(state), []);
  assert.equal("savedProductSlugs" in state, false);
  assert.equal(JSON.parse(disk.get("cakecity.preferences.v3")).state.owner, undefined);
  releaseDeviceState();
});

test("order detail polling stops on every server terminal state", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/features/commerce/AppOrdersScreen.tsx"),
    "utf8",
  );
  const poll = source.slice(source.indexOf("refetchInterval"), source.indexOf("? false"));
  for (const state of ["completed", "cancelled", "failed", "payment_failed", "reversed", "review_required"])
    assert.match(poll, new RegExp(`"${state}"`));
});
