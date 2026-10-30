const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = (mocks, globals = {}) => {
  const filename = path.join(__dirname, "..", "src", "storage", "privateRecords.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"],
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

const fixture = () => {
  const files = new Map();
  const directories = new Set();
  const localRecords = new Map();
  const warnings = [];
  let failDirectoryCreate = false;
  let failFileWrite = false;
  const uriFor = (parent, name) => `${parent.uri}/${name}`;
  class Directory {
    constructor(base, ...parts) {
      this.uri = [base, ...parts].join("/");
      this.name = parts.at(-1);
    }
    get exists() { return directories.has(this.uri); }
    create() {
      if (failDirectoryCreate) throw new Error("Document directory unavailable");
      directories.add(this.uri);
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new File(this, uri.slice(this.uri.length + 1)));
    }
  }
  class File {
    constructor(parent, name) {
      this.uri = typeof parent === "string" ? parent : uriFor(parent, name);
      this.name = name;
    }
    get exists() { return files.has(this.uri); }
    async text() { return files.get(this.uri); }
    write(value) {
      if (failFileWrite) throw new Error("Document write failed");
      files.set(this.uri, value);
    }
    async move(target, options) {
      if (files.has(target.uri) && !options.overwrite) throw new Error("Target exists");
      files.set(target.uri, files.get(this.uri));
      files.delete(this.uri);
    }
    delete() { files.delete(this.uri); }
  }
  const AsyncStorage = {
    getItem: async (key) => localRecords.get(key) ?? null,
    setItem: async (key, value) => localRecords.set(key, value),
    removeItem: async (key) => localRecords.delete(key),
    getAllKeys: async () => [...localRecords.keys()],
  };
  const storage = load({
    "@react-native-async-storage/async-storage": AsyncStorage,
    "expo-file-system": { Directory, File, Paths: { document: "documents" } },
    "expo-crypto": { randomUUID: () => "temporary-id" },
    "../utils/ownerSession": {
      encodeStoredRecord: (_key, value) => JSON.stringify({ version: 1, nonce: "test", value }),
      decodeStoredRecord: (_key, value) => {
        if (typeof value !== "string" || !value.startsWith('{"version":1,"nonce":')) return value;
        return JSON.parse(value).value;
      },
    },
  }, { console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) } });
  return {
    storage, files, localRecords, warnings,
    failDirectoryCreate: (value) => { failDirectoryCreate = value; },
    failFileWrite: (value) => { failFileWrite = value; },
  };
};

test("stores local records in files and serializes concurrent updates", async () => {
  const f = fixture();
  const key = "looptalk:conversation:alice:room";
  await f.storage.setItem(key, "initial");
  assert.equal(await f.storage.getItem(key), "initial");
  await Promise.all(Array.from({ length: 10 }, () =>
    f.storage.updateItem(key, (value) => `${value}!`)
  ));
  assert.equal(await f.storage.getItem(key), "initial!!!!!!!!!!");
  assert.equal(f.localRecords.has(key), false);
});

test("falls back to key-value storage when a new file-backed record cannot be created", async () => {
  const f = fixture();
  const key = "looptalk:message-outbox:alice";
  f.failDirectoryCreate(true);
  await f.storage.setItem(key, "queued");
  assert.equal(JSON.parse(f.localRecords.get(key)).value, "queued");
  assert.equal(await f.storage.getItem(key), "queued");
  assert.equal(f.warnings.length, 1);
});

test("does not replace an existing file-backed record when a later file write fails", async () => {
  const f = fixture();
  const key = "looptalk:conversation:alice:room";
  await f.storage.setItem(key, "saved");
  f.failFileWrite(true);
  await assert.rejects(f.storage.setItem(key, "replacement"), /Document write failed/);
  assert.equal(await f.storage.getItem(key), "saved");
  assert.equal(f.localRecords.has(key), false);
});

test("owner record migration retains encrypted fallback data when file storage is unavailable", async () => {
  const f = fixture();
  const userId = "u_0123456789abcdef0123456789abcdef";
  const key = `looptalk:conversation:${userId}:room`;
  const encrypted = JSON.stringify({ version: 1, nonce: "test", value: "history" });
  f.localRecords.set(key, encrypted);
  f.failDirectoryCreate(true);
  const entries = await f.storage.migrateOwnerRecords(userId);
  assert.deepEqual(JSON.parse(JSON.stringify(entries)), [[key, "history"]]);
  assert.equal(f.localRecords.get(key), encrypted);
});
