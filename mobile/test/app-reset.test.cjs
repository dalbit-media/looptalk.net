const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = (relative, mocks, globals = {}) => {
  const filename = path.resolve(__dirname, "../src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, ...globals,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
};
const resetId = "a122b456-1234-4234-8234-123456789abc";
const fixture = () => {
  const values = new Map();
  const events = [];
  let response = { resetId: "initial" };
  let fetchError;
  let cleanupError;
  const warnings = [];
  const AsyncStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { events.push("marker"); values.set(key, value); },
  };
  const reset = load("utils/appReset.js", {
    "@react-native-async-storage/async-storage": AsyncStorage,
    "../api/client": { api: { get: async () => {
      events.push("fetch");
      if (fetchError) throw fetchError;
      return { data: response };
    } } },
    "../config/environment": { API_URL: "https://test.invalid" },
    "../storage/resetStorage": { clearClientStorage: async (user) => {
      events.push(`clear:${user}`);
      if (cleanupError) throw cleanupError;
      values.clear();
    } },
  }, { console: { warn: (...args) => warnings.push(args) } });
  return {
    values, events, reset, warnings,
    beforeClear: async () => { events.push("logout"); return "alice"; },
    response: (value) => { response = value; },
    failFetch: (value) => { fetchError = value; },
    failCleanup: (value) => { cleanupError = value; },
  };
};

test("initial deployment preserves existing data; a reset clears before saving the ID and only once", async () => {
  const f = fixture();
  f.values.set("existing", "retain");
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), false);
  assert.equal(f.values.get("existing"), "retain");
  f.events.length = 0;
  f.response({ resetId });
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), true);
  assert.deepEqual(f.events, ["fetch", "logout", "clear:alice", "marker"]);
  f.events.length = 0;
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), false);
  assert.deepEqual(f.events, ["fetch", "marker"]);
});

test("upgraded clients without a saved ID still clear after a reset; concurrent checks share cleanup", async () => {
  const f = fixture();
  f.response({ resetId });
  const first = f.reset.synchronizeAppReset(f.beforeClear);
  const second = f.reset.synchronizeAppReset(f.beforeClear);
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(f.events.filter((event) => event === "logout").length, 1);
});

test("cleanup failure never acknowledges a reset and retries the exact operation", async () => {
  const f = fixture();
  f.response({ resetId });
  f.failCleanup(new Error("Disk failure"));
  await assert.rejects(f.reset.synchronizeAppReset(f.beforeClear), /Disk failure/);
  assert.equal(f.events.includes("marker"), false);
  f.failCleanup(null);
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), true);
});

test("offline checks warn and retry; invalid states and HTTP errors are surfaced without wiping", async () => {
  const f = fixture();
  f.failFetch(Object.assign(new Error("Offline"), { isAxiosError: true }));
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), false);
  assert.equal(f.warnings.length, 1);
  assert.equal(f.events.includes("logout"), false);
  f.failFetch(new TypeError("Invalid client configuration"));
  await assert.rejects(f.reset.synchronizeAppReset(f.beforeClear), /Invalid client configuration/);
  f.failFetch(Object.assign(new Error("Unavailable"), { response: { status: 503 } }));
  await assert.rejects(f.reset.synchronizeAppReset(f.beforeClear), /Unavailable/);
  f.failFetch(null);
  f.response({ resetId: null });
  await assert.rejects(f.reset.synchronizeAppReset(f.beforeClear), /Invalid/);
  f.response({ resetId });
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), true);
});

test("a running tab logs out after another tab resets, without erasing newly created local records again", async () => {
  const f = fixture();
  await f.reset.synchronizeAppReset(f.beforeClear);
  for (const key of f.values.keys()) f.values.set(key, resetId);
  f.values.set("new-record-after-reset", "retain");
  f.response({ resetId });
  assert.equal(await f.reset.synchronizeAppReset(f.beforeClear), true);
  assert.equal(f.events.includes("logout"), true);
  assert.equal(f.events.includes("clear:alice"), false);
  assert.equal(f.values.get("new-record-after-reset"), "retain");
});

test("storage ownership is scoped to LoopTalk keys, preferences, and known legacy identity users", () => {
  const keys = load("storage/resetKeys.js", {});
  for (const key of ["token", "themeMode", "looptalk:conversation:alice:room", "looptalk.webAppInstalled"]) {
    assert.equal(keys.isAppStorageKey(key), true);
  }
  for (const key of ["another-app", "access_token", "theme", null, "looptalk-other-app"]) {
    assert.equal(keys.isAppStorageKey(key), false);
  }
  assert.deepEqual([...keys.legacyDeviceUsers([
    "looptalk:conversation:alice:room", "looptalk:secure-identity:alice", "unrelated",
    "looptalk:app-reset:https://test.invalid",
  ])], ["alice"]);
});

test("native cleanup deletes only dedicated app directories, scoped AsyncStorage and known secure keys", async () => {
  const events = [];
  const keys = load("storage/resetKeys.js", {});
  const storage = load("storage/resetStorage.js", {
    "@react-native-async-storage/async-storage": {
      multiRemove: async (values) => events.push(["remove", [...values]]),
    },
    "expo-secure-store": { deleteItemAsync: async (key) => events.push(["secure", key]) },
    "expo-file-system": {
      Paths: { document: "documents", cache: "cache" },
      Directory: class {
        constructor(base, name) { this.path = `${base}/${name}`; this.exists = true; }
        delete() { events.push(["directory", this.path]); }
      },
    },
    "./privateRecords": { getAllKeys: async () => ["looptalk:conversation:alice:room", "other-app", "themeMode"] },
    "./resetKeys": keys,
  });
  await storage.clearClientStorage("bob");
  assert.deepEqual(events.filter(([type]) => type === "directory"), [
    ["directory", "documents/private-messages"], ["directory", "documents/private-media"], ["directory", "cache/private-preview"],
  ]);
  assert.ok(events.some(([type, key]) => type === "secure" && key === "looptalk.secure-device.alice"));
  assert.ok(events.some(([type, key]) => type === "secure" && key === "looptalk.secure-device.bob"));
  assert.deepEqual(events.at(-1), ["remove", ["looptalk:conversation:alice:room", "themeMode"]]);
});

test("web cleanup atomically clears records/media and leaves unrelated browser storage untouched", async () => {
  const events = [];
  const keys = load("storage/resetKeys.js", {});
  const local = new Map([["themeMode", "dark"], ["other-app", "retain"]]);
  const session = new Map([["looptalk.incomingCall", "old"], ["other-app", "retain"]]);
  const browserStorage = (map) => ({
    get length() { return map.size; },
    key: (index) => [...map.keys()][index],
    removeItem: (key) => map.delete(key),
  });
  const storage = load("storage/resetStorage.web.js", {
    "@react-native-async-storage/async-storage": {
      getAllKeys: async () => ["themeMode", "other-app"],
      multiRemove: async (values) => events.push(["remove", [...values]]),
    },
    "./privateRecords": { openPrivateDatabase: async () => ({
      transaction: (stores, mode) => {
        assert.deepEqual([...stores], ["records", "media"]);
        assert.equal(mode, "readwrite");
        const transaction = {
          objectStore: (name) => ({ clear: () => events.push(["clear", name]) }),
        };
        queueMicrotask(() => transaction.oncomplete());
        return transaction;
      },
    }) },
    "../utils/privateMedia": { clearPrivateMediaUrls: () => events.push(["revoke"]) },
    "./resetKeys": keys,
  }, { window: { localStorage: browserStorage(local), sessionStorage: browserStorage(session) } });
  await storage.clearClientStorage();
  assert.deepEqual(events, [["clear", "records"], ["clear", "media"], ["revoke"], ["remove", ["themeMode"]]]);
  assert.deepEqual([...local], [["other-app", "retain"]]);
  assert.deepEqual([...session], [["other-app", "retain"]]);
});
