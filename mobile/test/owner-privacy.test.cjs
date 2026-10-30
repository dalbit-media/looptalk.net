const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, verify, createPublicKey } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = (relative, mocks = {}) => {
  const filename = path.join(__dirname, "..", "src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Uint8Array, console, Map, Set, Promise,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename });
  return module.exports;
};
const random = (length) => new Uint8Array(randomBytes(length));
const crypto = load("utils/accountEncryption.js");
const credentials = load("utils/credentialEncryption.js", { "./accountEncryption": crypto });
const identity = () => crypto.generateAccountIdentity(random);
const expo = { getRandomBytes: random };
const session = load("utils/ownerSession.js", {
  "expo-crypto": expo, "./accountEncryption": crypto,
});

test("recovery key restores opaque account identity and authenticates using standard Ed25519", () => {
  const owner = identity();
  assert.match(owner.recoveryKey, /^loop2\.[A-Za-z0-9_-]{43}$/);
  assert.match(owner.accountId, /^u_[a-f0-9]{32}$/);
  assert.equal(crypto.identityFromRecoveryKey(owner.recoveryKey).accountId, owner.accountId);
  const challenge = randomBytes(64);
  const signature = crypto.signAccountChallenge(owner.recoveryKey, challenge.toString("base64"));
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(owner.publicKey, "base64")]),
    format: "der", type: "spki",
  });
  assert.equal(verify(null, challenge, publicKey, Buffer.from(signature, "base64")), true);
  assert.equal(verify(null, randomBytes(64), publicKey, Buffer.from(signature, "base64")), false);
  for (const key of ["", "password", owner.recoveryKey + "x", owner.recoveryKey.replace("loop2.", "loop1.")]) {
    assert.throws(() => crypto.identityFromRecoveryKey(key), /recovery key|encoding/);
  }
});

test("only the owner can decrypt authenticated private data, with fresh nonces and context binding", () => {
  const owner = identity();
  const other = identity();
  const value = { displayName: "Private Alice", email: "private@example.test", contacts: ["Secret friend"] };
  const sealed = crypto.encryptOwnerValue(owner, "vault", value, random);
  const second = crypto.encryptOwnerValue(owner, "vault", value, random);
  assert.notEqual(sealed.nonce, second.nonce);
  const serialized = JSON.stringify(sealed);
  for (const secret of ["Private Alice", "private@example.test", "Secret friend", owner.recoveryKey]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(crypto.decryptOwnerValue(owner, "vault", sealed).displayName, value.displayName);
  assert.throws(() => crypto.decryptOwnerValue(other, "vault", sealed), /authenticate/);
  assert.throws(() => crypto.decryptOwnerValue(owner, "record:other", sealed), /authenticate|another account/);
  const corrupted = Buffer.from(sealed.ciphertext, "base64");
  corrupted[0] ^= 1;
  assert.throws(() => crypto.decryptOwnerValue(owner, "vault", {
    ...sealed, ciphertext: corrupted.toString("base64"),
  }), /authenticate/);
  assert.throws(() => crypto.decryptOwnerValue(owner, "vault", { ...sealed, version: 2 }), /Unsupported/);
  assert.throws(() => crypto.decryptOwnerValue(owner, "vault", { ...sealed, nonce: "invalid" }), /encoding/);
});

test("local records are encrypted, account/record-bound, and inaccessible while locked", () => {
  const owner = identity();
  const key = `looptalk:conversation:${owner.accountId}:room`;
  session.setOwnerSession({ identity: owner, token: "session" });
  const stored = session.encodeStoredRecord(key, "A secret message");
  assert.equal(stored.includes("A secret message"), false);
  assert.equal(session.decodeStoredRecord(key, stored), "A secret message");
  assert.throws(() => session.decodeStoredRecord(`${key}-other`, stored), /another account/);
  assert.throws(() => session.decodeStoredRecord(key, JSON.stringify("plaintext")), /Unsupported/);
  session.clearOwnerSession();
  assert.throws(() => session.decodeStoredRecord(key, stored), /Unlock/);
  assert.throws(() => session.encodeStoredRecord(key, "plaintext"), /Unlock/);
  session.setOwnerSession({ identity: identity(), token: "other-session" });
  assert.throws(() => session.decodeStoredRecord(key, stored), /Unlock/);
  session.clearOwnerSession();
});

const vaultFixture = () => {
  const owner = identity();
  let remote = null;
  let remoteRevision = 1;
  const requests = [];
  const api = {
    get: async () => ({ data: { vault: remote, revision: remoteRevision } }),
    put: async (url, body) => {
      requests.push({ url, body });
      if (body.expectedRevision !== remoteRevision) {
        const error = new Error("Conflict");
        error.response = { status: 409 };
        throw error;
      }
      remote = body.vault;
      remoteRevision += 1;
      return { data: { revision: remoteRevision } };
    },
  };
  const vault = load("utils/ownerVault.js", {
    "expo-crypto": expo, "../api/client": { api }, "./accountEncryption": crypto,
    "./ownerSession": session,
    "../storage/ownerIdentityStorage": {
      readOwnerIdentity: async () => null, saveOwnerIdentity: async () => {}, removeOwnerIdentity: async () => {},
    },
    "./privateMedia": { clearPrivateMediaUrls() {}, migratePrivateMedia: async () => {} },
    "../storage/privateRecords": { migrateOwnerRecords: async () => [] },
    "../storage/deviceIdentity": { migrateDeviceIdentity: async () => {} },
  });
  return {
    owner, vault, requests,
    initialize: async () => {
      const initial = await vault.createOwnerVault(owner, { displayName: "Only the owner" });
      remote = initial.vault;
      await vault.setVaultSession({ identity: owner, token: "session", vault: remote, revision: 1 });
    },
    remoteEdit: () => {
      remoteRevision += 1;
      const value = crypto.decryptOwnerValue(owner, "vault", remote);
      remote = crypto.encryptOwnerValue(owner, "vault", { ...value, revision: remoteRevision }, random);
    },
  };
};

test("private profile and contacts sync only as ciphertext with serialized compare-and-swap writes", async () => {
  const f = vaultFixture();
  await f.initialize();
  await Promise.all([
    f.vault.updateOwnerProfile({ bio: "Confidential biography" }),
    f.vault.updateOwnerVault((current) => ({ ...current, contacts: [{ nickname: "Private contact" }] })),
  ]);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests.map((request) => request.body.expectedRevision), [1, 2]);
  const wire = JSON.stringify(f.requests);
  assert.equal(wire.includes("Confidential biography"), false);
  assert.equal(wire.includes("Private contact"), false);
  assert.equal(wire.includes(f.owner.recoveryKey), false);
  assert.equal(f.vault.getOwnerProfile({ id: f.owner.accountId, username: "opaque" }).bio, "Confidential biography");
  await f.vault.lockOwnerVault();
  assert.throws(() => f.vault.readOwnerVault(), /Unlock/);
});

test("a conflicting vault write refreshes authenticated data and requires an explicit retry", async () => {
  const f = vaultFixture();
  await f.initialize();
  f.remoteEdit();
  await assert.rejects(f.vault.updateOwnerProfile({ bio: "New bio" }), /another device.*retry/);
  assert.equal(f.vault.readOwnerVault().profile.bio, undefined);
  await f.vault.updateOwnerProfile({ bio: "New bio" });
  assert.equal(f.requests.at(-1).body.expectedRevision, 2);
  assert.equal(f.vault.readOwnerVault().profile.bio, "New bio");
  await f.vault.lockOwnerVault();
});

test("vault revisions are authenticated and cannot be relabeled by the server", async () => {
  const f = vaultFixture();
  const initial = await f.vault.createOwnerVault(f.owner, { displayName: "Private" });
  await assert.rejects(f.vault.setVaultSession({
    identity: f.owner, token: "session", vault: initial.vault, revision: 2,
  }), /revision|session/);
  await f.vault.lockOwnerVault();
});

test("contact labels and group names never enter readable messaging/contact requests", async () => {
  const owner = identity();
  session.setOwnerSession({ identity: owner, token: "session" });
  let state = { contacts: [], conversationNames: {} };
  const requests = [];
  const fakeVault = {
    readOwnerVault: () => state,
    updateOwnerVault: async (update) => { state = update(state); return state; },
  };
  const api = {
    get: async (url) => {
      requests.push({ method: "GET", url });
      if (url.startsWith("/users/")) return { data: { id: "u_peer", username: "opaque", displayName: "opaque" } };
      return { data: { id: "room", name: null, participants: [] } };
    },
    post: async (url, body) => {
      requests.push({ method: "POST", url, body });
      if (url === "/users/profiles") return { data: [{ id: "u_peer", username: "opaque", displayName: "Public Name" }] };
      return { data: { id: "room", name: null, participants: [] } };
    },
  };
  const contacts = load("api/contacts.js", {
    "./client": { api }, "../utils/ownerVault": fakeVault, "../utils/ownerSession": session,
    "../utils/contactDisplayName": load("utils/contactDisplayName.js", {}),
  });

  await contacts.addContact("u_peer", "Family 1", "Secret friend", "token", "Shared display name");
  const saved = await contacts.getContact("u_peer");
  assert.equal(saved.contactUser.displayName, "Shared display name");
  assert.equal(saved.contactUser.username, "opaque");
  const refreshed = (await contacts.getContacts("token"))["Family 1"][0];
  assert.equal(refreshed.contactUser.displayName, "Public Name");
  assert.equal(refreshed.nickname, "Secret friend");
  assert.equal(state.contacts[0].contactUser.displayName, "Shared display name");
  await contacts.updateContact("u_peer", { nickname: "New private label" });
  assert.equal((await contacts.getContact("u_peer")).nickname, "New private label");
  const messages = load("api/messages.js", {
    "./client": { api }, "../utils/ownerVault": fakeVault, "../utils/ownerSession": session,
    "../utils/contactDisplayName": load("utils/contactDisplayName.js", {}),
  });
  assert.equal((await messages.createGroupConversation("Private family", ["u_peer"], "token")).name, "Private family");
  assert.equal((await messages.renameGroupConversation("room", "Private renamed group", "token")).name, "Private renamed group");
  const wire = JSON.stringify(requests);
  for (const secret of ["Shared display name", "Secret friend", "New private label", "Private family", "Private renamed group"]) {
    assert.equal(wire.includes(secret), false);
  }
  assert.equal(requests.some((request) => request.url.startsWith("/contacts")), false);
  assert.equal(owner.accountId.startsWith("u_"), true);
  session.clearOwnerSession();
});

test("normalized email/phone and exact password derive the account without exposing the credential pair", async () => {
    const salt = randomBytes(16).toString("base64");
    assert.equal(credentials.normalizeIdentifier(" Alice@Example.TEST "), "alice@example.test");
    assert.equal(credentials.normalizeIdentifier("+1 (202) 555-0123"), "+12025550123");
    for (const invalid of ["", "a", "a@b", "123", "+1abc5550123", "-bad", "under_score"]) {
      assert.throws(() => credentials.normalizeIdentifier(invalid), /Invalid/);
    }
    assert.equal(credentials.normalizeIdentifier(" Brave-Otter-123 "), "brave-otter-123");
    const a = await credentials.createCredentialIdentity(" Alice@Example.TEST ", "Exact Password ", salt);
    const b = await credentials.createCredentialIdentity("alice@example.test", "Exact Password ", salt);
    const c = await credentials.createCredentialIdentity("alice@example.test", "Exact Password", salt);
    assert.equal(a.accountId, b.accountId);
    assert.notEqual(a.accountId, c.accountId);
    assert.equal(JSON.stringify(a).includes("alice@example.test"), false);
    assert.equal(JSON.stringify(a).includes("Exact Password"), false);
    const sealed = crypto.encryptOwnerValue(a, "vault", { profile: "Private" }, random);
    assert.throws(() => crypto.decryptOwnerValue(c, "vault", sealed), /authenticate/);
    await assert.rejects(credentials.createCredentialIdentity("alice@example.test", "short", salt), /8 to 128/);
  });

test("random routing IDs remain separate from credential-derived encryption identity", async () => {
  const f = vaultFixture();
  const initial = await f.vault.createOwnerVault(f.owner, { displayName: "Only owner" });
  const routingId = `u_${randomBytes(16).toString("hex")}`;
  await f.vault.setVaultSession({
    identity: { ...f.owner, userId: routingId }, token: "session", vault: initial.vault, revision: 1,
  });
  assert.equal(f.vault.getOwnerProfile({ id: routingId, username: "public_handle" }).displayName, "Only owner");
  const key = `looptalk:conversation:${routingId}:room`;
  const encoded = session.encodeStoredRecord(key, "Private history");
  assert.equal(encoded.includes("Private history"), false);
  assert.equal(session.decodeStoredRecord(key, encoded), "Private history");
  await f.vault.lockOwnerVault();
  assert.throws(() => session.decodeStoredRecord(key, encoded), /Unlock/);
});

test("encrypted preference sync failures notify the owner without applying a false success", async () => {
    const alerts = [];
    const store = load("store/preferencesStore.js", {
      "@react-native-async-storage/async-storage": {
        getItem: async () => null, setItem: async () => { throw new Error("Unexpected readable preference write"); },
      },
      "../i18n/i18n": { getDeviceLanguage: () => "ko", setLanguage() {}, t: (key) => key },
      "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
      "../utils/ownerVault": {
        getOwnerIdentity: () => ({ accountId: "private" }),
        readOwnerVault: () => ({ preferences: {} }),
        updateOwnerVault: async () => { throw new Error("Network unavailable"); },
      },
    }).usePreferencesStore;
    await store.getState().setThemeMode("dark");
    assert.equal(store.getState().themeMode, "system");
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][1], "privacy.preferenceSaveFailed");
});

test("preference storage read failures keep startup usable and report defaults", async () => {
    const alerts = [];
    const store = load("store/preferencesStore.js", {
      "@react-native-async-storage/async-storage": {
        getItem: async (key) => {
          if (key === "themeMode") throw new Error("Local storage unavailable");
          return {
            language: null,
            chatTextSize: "large",
            notificationsEnabled: "true",
          }[key] ?? null;
        },
        setItem: async () => { throw new Error("Local storage unavailable"); },
      },
      "../i18n/i18n": { getDeviceLanguage: () => "ko", setLanguage() {}, t: (key) => key },
      "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
      "../utils/ownerVault": {
        getOwnerIdentity: () => null,
        readOwnerVault: () => ({ preferences: {} }),
        updateOwnerVault: async () => {},
      },
    }).usePreferencesStore;
    await store.getState().initialize();
    assert.equal(store.getState().themeMode, "system");
    assert.equal(store.getState().chatTextSize, "large");
    assert.equal(store.getState().notificationsEnabled, true);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][1], "privacy.preferenceLoadFailed");
});
