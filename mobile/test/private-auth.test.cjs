const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const babel = require("@babel/core");
const { create } = require("zustand");

const root = path.resolve(__dirname, "..");
const load = (relative, mocks) => {
  const filename = path.join(root, relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return exports;
};

const identity = { accountId: "canonical-alias", publicKey: "public-key", recoveryKey: "loop2.owner-secret" };
const identifier = "person@example.com";
const password = " exact password ";
const salt = "credential-salt";
const vault = { version: 1, nonce: "nonce", ciphertext: "encrypted-private-name" };
const response = { accountId: identity.accountId, user: { id: "u_random", username: "random_handle", displayName: "random_handle" }, token: "token", vault, revision: 1 };

test("registration keeps a single concise notice in every supported language", () => {
  const source = fs.readFileSync(path.join(root, "src/screens/auth/RegisterScreen.js"), "utf8");
  assert.doesNotMatch(source, /t\("privacy\.profileNotice"\)/);
  assert.equal((source.match(/t\("auth\.credentialNotice"\)/g) || []).length, 1);
  const { default: i18n } = load("src/i18n/i18n.js", { "i18n-js": require("i18n-js") });
  for (const locale of ["ko", "en", "ja"]) {
    const notice = i18n.translations[locale]["auth.credentialNotice"];
    assert.ok(notice.length > 0 && notice.length <= 100, `${locale}: ${notice}`);
    assert.match(notice, /8.+128/);
  }
});

const setupStore = (options = {}) => {
  const events = [];
  let savedToken = options.token || null;
  let owner = options.identity || null;
  let generation = 0;
  const profile = { displayName: "Private Name", bio: "Private Bio" };
  const runtime = {};
  for (const name of ["messageStore", "contactStore", "callStore", "alertStore", "preferencesStore"]) {
    runtime[name] = create(() => ({
      contacts: { private: ["someone"] }, messages: ["old"], conversations: ["old"],
      cleanup: () => events.push(["cleanup"]),
      endCall: () => events.push(["endCall"]),
      loadOwnerPreferences: () => events.push(["loadPreferences"]),
      resetOwnerPreferences: () => events.push(["resetPreferences"]),
    }));
  }
  const store = load("src/store/authStore.js", {
    "../utils/ownerSession": {
      getOwnerGeneration: () => generation,
      assertOwnerGeneration: (expected) => {
        if (expected !== generation) throw new Error("Private account changed");
      },
    },
    "../utils/invitationOnboarding": { initializeInvitationContact: async (token, userId) => {
      assert.equal(token, "token");
      assert.equal(userId, "u_random");
      events.push(["onboarding"]);
      if (options.onboardingError) throw new Error("Unable to save invitation contact");
      return options.welcomeConversationId || null;
    } },
    zustand: { create },
    "../utils/tokenStorage": {
      getItemAsync: async () => savedToken,
      setItemAsync: async (_key, value) => { savedToken = value; events.push(["saveToken"]); },
      deleteItemAsync: async () => { savedToken = null; },
    },
    "../api/auth": {
      getCredentialParameters: async (value) => {
        events.push(["parameters", value]);
        return { salt, iterations: options.badParameters ? 1 : 600000, version: 1 };
      },
      register: async (...args) => { events.push(["register", ...args]); return options.response || response; },
      getChallenge: async (...args) => { events.push(["challenge", ...args]); return { challengeId: "challenge-id", challenge: "base64-challenge" }; },
      login: async (...args) => {
        events.push(["login", ...args]);
        if (options.loginError) throw options.loginError;
        if (options.waitForLogin) await options.waitForLogin();
        return options.response || response;
      },
      getCurrentUser: async () => { events.push(["me"]); return response.user; },
    },
    "../api/users": {
      getOwnerVault: async () => { events.push(["vault"]); return { vault, revision: 1 }; },
      publishDisplayName: async (name, token) => {
        events.push(["publishName", name, token]);
        if (options.publishError) throw options.publishError;
      },
    },
    "../utils/accountPrivacy": {
      normalizeIdentifier: (value) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized.includes("@") && !/^\+\d{7,15}$/.test(normalized)) throw new Error("Invalid identifier");
        return normalized;
      },
      createCredentialSalt: () => salt,
      createCredentialIdentity: async (value, secret, credentialSalt) => {
        assert.equal(value, identifier);
        assert.equal(secret, password);
        assert.equal(credentialSalt, salt);
        return identity;
      },
      signAccountChallenge: (key, challenge) => {
        assert.equal(key, identity.recoveryKey);
        assert.equal(challenge, "base64-challenge");
        return "signature";
      },
    },
    "../utils/ownerVault": {
      getSavedOwnerIdentity: async () => owner,
      lockOwnerVault: async ({ forgetIdentity = true } = {}) => {
        generation++;
        if (forgetIdentity) owner = null;
        events.push(["lock", forgetIdentity]);
      },
      updateVaultSessionToken: (token) => { events.push(["vaultToken", token]); },
      createOwnerVault: async (_identity, value) => { events.push(["createVault", value]); return { vault, data: { profile: value } }; },
      unlockOwnerVault: async () => {
        if (options.corrupt) throw new Error("Invalid encrypted data");
        events.push(["unlock"]);
      },
      setVaultSession: async (session) => {
        if (options.corrupt) throw new Error("Invalid encrypted data");
        owner = session.identity;
        generation++;
        events.push(["setSession"]);
      },
      getOwnerProfile: (user) => ({ ...user, ...profile }),
    },
    "./messageStore": { useMessageStore: runtime.messageStore },
    "./contactStore": { useContactStore: runtime.contactStore },
    "./callStore": { useCallStore: runtime.callStore },
    "./alertStore": { useAlertStore: runtime.alertStore },
    "./preferencesStore": { usePreferencesStore: runtime.preferencesStore },
  }).useAuthStore;
  return { store, events, runtime, token: () => savedToken, owner: () => owner };
};

test("initialization with no device identity never fetches or accepts a server-only token", async () => {
  const { store, events, token } = setupStore({ token: "stale-web-token" });
  await store.getState().initialize();
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().loading, false);
  assert.equal(token(), null);
  assert.ok(!events.some(([name]) => ["me", "vault", "setSession"].includes(name)));
});

test("saved device initialization renews expired tokens without a password before opening the vault", async () => {
  const { store, events } = setupStore({ token: "expired-token", identity });
  await store.getState().initialize();
  assert.equal(store.getState().user.displayName, "Private Name");
  assert.ok(events.some(([name]) => name === "setSession"));
  assert.ok(events.some(([name]) => name === "loadPreferences"));
  assert.deepEqual(events.find(([name]) => name === "login"), ["login", identity.accountId, "challenge-id", "signature"]);
  assert.ok(!events.some(([name]) => ["me", "vault", "parameters"].includes(name)));
  assert.equal(store.getState().token, "token");
  assert.deepEqual(events.find(([name]) => name === "publishName"), ["publishName", "Private Name", "token"]);
});

test("public name publication failures prevent false-success initialization", async () => {
  const fixture = setupStore({ token: "saved-token", identity, publishError: new Error("Publication failed") });
  await assert.rejects(fixture.store.getState().initialize(), /Publication failed/);
  assert.equal(fixture.store.getState().initializationError, true);
  assert.equal(fixture.store.getState().user, null);
});

test("startup connectivity failures preserve local sign-in and surface a retryable error", async () => {
  const options = { token: "saved-token", identity, loginError: new Error("Offline") };
  const fixture = setupStore(options);
  await assert.rejects(fixture.store.getState().initialize(), /Offline/);
  assert.equal(fixture.token(), "saved-token");
  assert.equal(fixture.owner(), identity);
  assert.equal(fixture.store.getState().initializationError, true);
  assert.equal(fixture.store.getState().user, null);
  options.loginError = null;
  await fixture.store.getState().initialize();
  assert.equal(fixture.store.getState().user.displayName, "Private Name");
});

test("server rejection of the saved identity clears local sign-in instead of looping", async () => {
  const fixture = setupStore({
    token: "saved-token", identity,
    loginError: Object.assign(new Error("Account deleted"), { response: { status: 401 } }),
  });
  await fixture.store.getState().initialize();
  assert.equal(fixture.token(), null);
  assert.equal(fixture.owner(), null);
  assert.equal(fixture.store.getState().initializationError, true);
});

test("active session renewal is bounded and does not reopen the vault or clear conversations", async () => {
  const options = {};
  const fixture = setupStore(options);
  await fixture.store.getState().login(identifier, password);
  await fixture.store.getState().renewSession();
  assert.equal(fixture.events.filter(([name]) => name === "login").length, 1);
  options.response = { ...response, token: "renewed-token" };
  fixture.store.setState({ sessionRenewedAt: 0 });
  const before = fixture.events.filter(([name]) => name === "setSession").length;
  await Promise.all([fixture.store.getState().renewSession(), fixture.store.getState().renewSession()]);
  assert.equal(fixture.events.filter(([name]) => name === "login").length, 2);
  assert.equal(fixture.events.filter(([name]) => name === "setSession").length, before);
  assert.equal(fixture.token(), "renewed-token");
  assert.equal(fixture.store.getState().token, "renewed-token");
  assert.deepEqual(fixture.events.find(([name]) => name === "vaultToken"), ["vaultToken", "renewed-token"]);
});

test("failed background renewal keeps saved credentials and the open session for retry", async () => {
  const options = {};
  const fixture = setupStore(options);
  await fixture.store.getState().login(identifier, password);
  fixture.store.setState({ sessionRenewedAt: 0 });
  options.loginError = new Error("Network unavailable");
  await assert.rejects(fixture.store.getState().renewSession(), /Network unavailable/);
  assert.equal(fixture.token(), "token");
  assert.equal(fixture.store.getState().user.displayName, "Private Name");
  assert.ok(fixture.owner());
});

test("renewal defers token replacement during calls so it cannot tear down an active call", async () => {
  const options = {};
  const fixture = setupStore(options);
  await fixture.store.getState().login(identifier, password);
  fixture.store.setState({ sessionRenewedAt: 0 });
  fixture.runtime.callStore.setState({ call: { callId: "active-call", status: "connected" } });
  options.response = { ...response, token: "renewed-token" };
  await fixture.store.getState().renewSession();
  assert.equal(fixture.store.getState().token, "token");
  assert.equal(fixture.token(), "token");
  fixture.runtime.callStore.setState({ call: null });
  await fixture.store.getState().renewSession();
  assert.equal(fixture.store.getState().token, "renewed-token");
});

test("logout during renewal prevents a delayed response from restoring the session", async () => {
  const options = {};
  const fixture = setupStore(options);
  await fixture.store.getState().login(identifier, password);
  fixture.store.setState({ sessionRenewedAt: 0 });
  let finish, started;
  const waiting = new Promise((resolve) => { started = resolve; });
  options.waitForLogin = () => { started(); return new Promise((resolve) => { finish = resolve; }); };
  const renewing = fixture.store.getState().renewSession();
  await waiting;
  await fixture.store.getState().logout();
  finish();
  await assert.rejects(renewing, /Private account changed/);
  assert.equal(fixture.token(), null);
  assert.equal(fixture.store.getState().token, null);
});

test("login normalizes the contact, derives with the exact password and sends only proof", async () => {
  const { store, events, owner } = setupStore();
  await store.getState().login(" PERSON@example.com ", password);
  const sent = events.filter(([name]) => ["challenge", "login"].includes(name));
  assert.deepEqual(sent, [["challenge", identity.accountId], ["login", identity.accountId, "challenge-id", "signature"]]);
  assert.ok(!JSON.stringify(sent).includes(identity.recoveryKey));
  assert.ok(!JSON.stringify(events).includes(password));
  assert.deepEqual(events.find(([name]) => name === "parameters"), ["parameters", identifier]);
  assert.equal(owner().userId, "u_random");
  assert.equal(owner().accountId, identity.accountId);
  assert.equal(store.getState().user.displayName, "Private Name");
});

test("signup publishes the name and immediately opens a random-ID account without key backup", async () => {
  const { store, events, token, owner } = setupStore();
  const invitation = "a".repeat(32);
  await store.getState().register(identifier, password, "Private Name", invitation);
  assert.deepEqual(events.find(([name]) => name === "register"), ["register", identifier, salt, identity.publicKey, vault, invitation, "Private Name"]);
  assert.equal(owner().userId, "u_random");
  assert.equal(owner().accountId, identity.accountId);
  assert.equal(store.getState().user.displayName, "Private Name");
  assert.equal(token(), "token");
  assert.equal(store.getState().pendingRegistration, null);
  assert.ok(events.some(([name]) => name === "loadPreferences"));
});

test("invalid credentials and encrypted vault errors never authenticate", async () => {
  for (const corrupt of [false, true]) {
    const { store, token, owner } = setupStore({ corrupt });
    await assert.rejects(store.getState().login(corrupt ? identifier : "invalid", password));
    assert.equal(store.getState().user, null);
    assert.equal(token(), null);
    assert.equal(owner(), null);
  }
});

test("signup, login, and startup publish the welcome only after contact onboarding succeeds", async () => {
  for (const method of ["register", "login", "initialize"]) {
    const fixture = setupStore({
      token: "token", identity, welcomeConversationId: "inviter-chat",
    });
    if (method === "register") await fixture.store.getState().register(identifier, password, "Private Name", "7AC4M9K2XE");
    else if (method === "login") await fixture.store.getState().login(identifier, password);
    else await fixture.store.getState().initialize();
    assert.equal(fixture.store.getState().welcomeConversationId, "inviter-chat");
    assert.ok(fixture.events.findIndex(([name]) => name === "setSession") <
      fixture.events.findIndex(([name]) => name === "onboarding"));
  }
});

test("failed contact onboarding never exposes a partially initialized authenticated session", async () => {
  const fixture = setupStore({ onboardingError: true });
  await assert.rejects(fixture.store.getState().login(identifier, password), /Unable to save invitation contact/);
  assert.equal(fixture.store.getState().user, null);
  assert.equal(fixture.store.getState().token, null);
  assert.equal(fixture.token(), null);
  assert.equal(fixture.owner(), null);
});

test("unsupported KDF metadata and mismatched canonical identity fail closed", async () => {
  for (const options of [
    { badParameters: true },
    { response: { ...response, accountId: "different-crypto-alias" } },
  ]) {
    const { store, owner, token } = setupStore(options);
    await assert.rejects(store.getState().login(identifier, password));
    assert.equal(store.getState().user, null);
    assert.equal(owner(), null);
    assert.equal(token(), null);
  }
});

test("registration rejects short and long passwords without transmitting anything", async () => {
  for (const secret of ["short", "x".repeat(129)]) {
    const { store, events } = setupStore();
    await assert.rejects(store.getState().register(identifier, secret, "Name", "invite"));
    assert.ok(!events.some(([name]) => name === "register"));
  }
});

test("logout clears contacts, conversations, messages, calls, token and vault", async () => {
  const { store, events, runtime, token, owner } = setupStore();
  await store.getState().login(identifier, password);
  runtime.contactStore.setState({ contacts: { secret: ["contact"] } });
  runtime.messageStore.setState({ messages: ["secret"], conversations: ["secret"] });
  await store.getState().logout();
  assert.equal(store.getState().user, null);
  assert.equal(token(), null);
  assert.equal(owner(), null);
  assert.equal(Object.keys(runtime.contactStore.getState().contacts).length, 0);
  assert.equal(runtime.messageStore.getState().messages.length, 0);
  assert.equal(runtime.messageStore.getState().conversations.length, 0);
  assert.ok(events.some(([name]) => name === "endCall"));
  assert.ok(events.some(([name]) => name === "cleanup"));
  assert.ok(events.some(([name]) => name === "resetPreferences"));
});

test("profile adapter encrypts edits and data URI avatars without a plaintext upload", async () => {
  const events = [];
  const privateProfile = { displayName: "Owner Name" };
  const publicRequests = [];
  const users = load("src/api/users.js", {
    "./client": { api: {
      get: async (url) => ({ data: { id: url.includes("peer") ? "peer" : identity.accountId, username: "opaque", displayName: "opaque" } }),
      post: () => { throw new Error("No plaintext upload allowed"); },
      put: async (url, body) => {
        publicRequests.push({ url, body });
        assert.ok(Object.keys(body).every((key) => ["username", "displayName"].includes(key)));
        return { data: { user: { id: identity.accountId, username: body.username || "opaque", displayName: body.displayName } } };
      },
    } },
    "expo-file-system": { File: class {} },
    "../utils/ownerVault": {
      getOwnerIdentity: () => identity,
      getOwnerProfile: (user) => ({ ...user, ...privateProfile }),
      updateOwnerProfile: async (patch) => { events.push(patch); Object.assign(privateProfile, patch); return patch; },
    },
  });
  const updated = await users.updateProfile({ bio: "secret" }, "token");
  assert.equal(updated.id, identity.accountId);
  const image = "data:image/png;base64,cHJpdmF0ZQ==";
  const uploaded = await users.uploadProfilePicture({ uri: image }, "token");
  assert.deepEqual(Object.keys(uploaded).sort(), ["url", "user"]);
  assert.equal(uploaded.url, image);
  assert.equal(uploaded.user.id, identity.accountId);
  assert.equal(uploaded.user.profilePicture, image);
  await users.updateProfile({ displayName: "  Owner Name  ", bio: "  owner only  " }, "token");
  assert.equal(events[2].displayName, "Owner Name");
  assert.equal(events[2].bio, "owner only");
  await assert.rejects(users.uploadProfilePicture({ uri: "data:image/png;base64," + "A".repeat(600000) }, "token"), { code: "PROFILE_PHOTO_TOO_LARGE" });
  await assert.rejects(users.uploadProfilePicture({ uri: "file:large.png", fileSize: 450001 }, "token"), { code: "PROFILE_PHOTO_TOO_LARGE" });
  await assert.rejects(users.updateProfile({ displayName: " " }, "token"));
  assert.equal(events.length, 3);
  assert.equal(events[0].bio, "secret");
  assert.equal(events[1].profilePicture, image);
  assert.equal((await users.getUser("peer", "token")).displayName, "opaque");
  assert.equal((await users.getUser(identity.accountId, "token")).displayName, "Owner Name");
  const reserved = await users.updateProfile({ username: "Public_Name", bio: "private" }, "token");
  assert.equal(reserved.username, "Public_Name");
  assert.deepEqual(JSON.parse(JSON.stringify(publicRequests)), [
    { url: "/users", body: { displayName: "Owner Name" } },
    { url: "/users", body: { username: "Public_Name" } },
  ]);
  assert.ok(events.every((patch) => !("username" in patch)));
  await assert.rejects(users.updateProfile({ username: "bad space" }, "token"), { code: "USERNAME_INVALID" });
});

test("auth transport sends a contact and salt but never password or raw internal key", async () => {
  const sent = [];
  const auth = load("src/api/auth.js", {
    "./client": { api: { post: async (url, body) => { sent.push({ url, body }); return { data: {} }; } } },
  });
  await auth.register(identifier, salt, identity.publicKey, vault, "INVITE01");
  await auth.getChallenge(identity.accountId);
  await auth.login(identity.accountId, "challenge-id", "signature");
  await auth.getCredentialParameters(identifier);
  assert.deepEqual(Object.keys(sent[0].body).sort(), ["credentialSalt", "identifier", "invitationCode", "publicKey", "vault"]);
  assert.deepEqual(Object.keys(sent[2].body).sort(), ["accountId", "challengeId", "signature"]);
  assert.equal(sent[3].url, "/auth/credential-parameters");
  assert.equal(sent[3].body.identifier, identifier);
  assert.ok(!JSON.stringify(sent).includes(password));
  assert.ok(!JSON.stringify(sent).includes("Private Name"));
  assert.ok(!JSON.stringify(sent).includes(identity.recoveryKey));
  await auth.register(identifier, salt, identity.publicKey, vault, "INVITE02", "Public Name");
  assert.equal(sent[4].body.displayName, "Public Name");
  assert.equal(auth.socialAuth, undefined);
});

test("explicit public username reservation preserves server conflict for localized UI", async () => {
  const conflict = Object.assign(new Error("Conflict"), { response: { status: 409 } });
  let encryptedWrites = 0;
  const users = load("src/api/users.js", {
    "./client": { api: { put: async (_url, body) => {
      assert.deepEqual(Object.keys(body), ["username"]);
      throw conflict;
    } } },
    "expo-file-system": { File: class {} },
    "../utils/ownerVault": {
      getOwnerIdentity: () => identity,
      getOwnerProfile: (user) => user,
      updateOwnerProfile: async () => { encryptedWrites++; },
    },
  });
  await assert.rejects(users.updateProfile({ username: "reserved", bio: "private" }, "token"), (error) => error === conflict);
  assert.equal(encryptedWrites, 0);
});

test("PUT /users unwraps the server user envelope and preserves random routing ID and normalized username", async () => {
  const routingId = "u_random_routing_id";
  const privateProfile = { displayName: "Private Owner", bio: "private details" };
  const publicUser = { id: routingId, username: "phaseone_alice", displayName: "phaseone_alice" };
  let privatePatch;
  const users = load("src/api/users.js", {
    "./client": { api: { put: async (url, body) => {
      assert.equal(url, "/users");
      assert.equal(body.username, "Phaseone_Alice");
      assert.deepEqual(Object.keys(body), ["username"]);
      return { data: { user: publicUser } };
    } } },
    "expo-file-system": { File: class {} },
    "../utils/ownerVault": {
      getOwnerIdentity: () => ({ ...identity, userId: routingId }),
      getOwnerProfile: (user) => ({ ...user, ...privateProfile }),
      updateOwnerProfile: async (patch) => { privatePatch = patch; Object.assign(privateProfile, patch); },
    },
  });
  const result = await users.updateProfile({ username: "Phaseone_Alice", bio: "new private bio" }, "token");
  assert.equal(result.id, routingId);
  assert.equal(result.username, "phaseone_alice");
  assert.equal(result.displayName, "Private Owner");
  assert.equal(result.bio, "new private bio");
  assert.deepEqual(Object.keys(privatePatch), ["bio"]);
  assert.ok(!("user" in result));
});

test("owned screens parse and expose credential fields without internal-key backup UI", () => {
  for (const relative of [
    "src/screens/auth/LoginScreen.js", "src/screens/auth/RegisterScreen.js",
    "src/screens/auth/InvitationScreen.js", "src/screens/app/ProfileScreen.js",
    "src/navigation/AppStack.js", "src/i18n/i18n.js",
  ]) {
    const filename = path.join(root, relative);
    const source = fs.readFileSync(filename, "utf8");
    babel.transformSync(source, {
      filename, configFile: false, babelrc: false,
      plugins: ["@babel/plugin-transform-react-jsx"],
    });
    if (relative.includes("LoginScreen") || relative.includes("RegisterScreen")) {
      assert.ok(!source.includes("SocialAuthButtons"));
      assert.ok(!source.includes("console."));
    }
    if (relative.includes("RegisterScreen")) {
      assert.match(source, /password !== confirmPassword/);
      assert.match(source, /password.length < 8/);
      assert.match(source, /register\(normalized, password, name, invitationCode\)/);
    }
    if (relative.includes("LoginScreen") || relative.includes("RegisterScreen") || relative.includes("ProfileScreen")) {
      assert.ok(!/getRecoveryKey|recoveryResponsibility|revealKey|backupTitle|acknowledgeRecoveryKey/.test(source));
    }
    if (relative.includes("ProfileScreen")) {
      const loadProfile = source.slice(source.indexOf("const loadUserProfile"), source.indexOf("const handleStartChat"));
      assert.match(loadProfile, /\? currentUser\s*: await UserAPI\.getUser/);
      assert.ok(!/updateProfile|uploadProfilePicture|\.put\(|\.post\(/.test(loadProfile));
    }
  }
});

test("discovery copy includes optional usernames without turning local contact search into exact-ID search", () => {
  const source = fs.readFileSync(path.join(root, "src/i18n/i18n.js"), "utf8");
  for (const key of [
    "common.back", "contacts.publicSearchPlaceholder", "contacts.searchPlaceholder",
  ]) {
    assert.equal(source.split(`"${key}":`).length - 1, 3, `${key} must cover Korean, English and Japanese`);
  }
  assert.match(source, /"contacts\.searchPlaceholder": "연락처 이름 또는 별명 검색"/);
  assert.match(source, /"contacts\.publicSearchPlaceholder": "정확한 계정 ID 또는 사용자명 입력"/);
  assert.ok(!/계정 코드|account handle|アカウントコード|검색 노출이나 낯선 사람/.test(source));
});
