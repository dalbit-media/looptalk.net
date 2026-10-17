const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const babel = require("@babel/core");

const filename = path.resolve(__dirname, "../src/utils/invitationOnboarding.js");
const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
  filename, configFile: false, babelrc: false,
  plugins: ["@babel/plugin-transform-modules-commonjs"],
});
const invitation = {
  inviter: { id: "inviter", username: "7ac40d92e681", displayName: "7ac40d92e681" },
  inviterDisplayName: "Alice",
  conversationId: "normal-chat",
  createdAt: "2026-10-17T09:00:00.000Z",
};
const setup = (options = {}) => {
  let current = { contacts: options.contacts || [], ...options.vault };
  let generation = 1;
  let requests = 0, writes = 0;
  let fail = options.fail;
  const exports = {};
  const mocks = {
    "../api/auth": { getInvitationOnboarding: async (token) => {
      assert.equal(token, "token");
      requests++;
      if (options.networkError) throw new Error("Offline");
      if (options.switchAccount) generation++;
      return options.onboarding === undefined ? invitation : options.onboarding;
    } },
    "./ownerSession": {
      getOwnerGeneration: () => generation,
      assertOwnerGeneration: (value) => { if (generation !== value) throw new Error("Session changed"); },
    },
    "./ownerVault": {
      readOwnerVault: () => structuredClone(current),
      updateOwnerVault: async (update) => {
        writes++;
        if (fail) { fail = false; throw new Error("Vault conflict. Please retry."); }
        current = update(structuredClone(current));
        return structuredClone(current);
      },
    },
  };
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  } }, { filename });
  return {
    initialize: () => exports.initializeInvitationContact("token", "invitee"),
    vault: () => current, counts: () => [requests, writes],
    removeContact: () => { current.contacts = []; },
  };
};

test("inviter is the first encrypted contact with a shared name and ordinary direct conversation", async () => {
  const other = { contactUserId: "other", nickname: "Existing friend" };
  const fixture = setup({ contacts: [other] });
  assert.equal(await fixture.initialize(), "normal-chat");
  const current = fixture.vault();
  assert.equal(current.contacts.length, 2);
  assert.equal(current.contacts[0].contactUserId, "inviter");
  assert.equal(current.contacts[0].contactUser.displayName, "Alice");
  assert.equal(current.contacts[0].contactUser.username, invitation.inviter.username);
  assert.equal(current.contacts[0].groupName, "All Contacts 1");
  assert.equal(current.contacts[1].nickname, "Existing friend");
  assert.equal(current.invitationOnboardingComplete, true);
});
test("relogin is idempotent, including after the user intentionally removes the inviter", async () => {
  const fixture = setup();
  await fixture.initialize();
  fixture.removeContact();
  assert.equal(await fixture.initialize(), null);
  assert.equal(fixture.vault().contacts.length, 0);
  assert.deepEqual(fixture.counts(), [1, 1]);
});
test("existing inviter contact keeps its private nickname, favorite, and group", async () => {
  const existing = { contactUserId: "inviter", nickname: "My friend", isFavorite: true, groupName: "Work 1" };
  const fixture = setup({ contacts: [{ contactUserId: "other" }, existing] });
  await fixture.initialize();
  assert.deepEqual(fixture.vault().contacts[0], existing);
  assert.equal(fixture.vault().contacts.length, 2);
});
test("missing name falls back to public identity, not another owner's private profile", async () => {
  const fixture = setup({ onboarding: { ...invitation, inviterDisplayName: null } });
  await fixture.initialize();
  assert.equal(fixture.vault().contacts[0].contactUser.displayName, invitation.inviter.username);
});
test("bootstrap, anonymous, and unavailable inviters create no synthetic contact or vault write", async () => {
  const fixture = setup({ onboarding: null });
  assert.equal(await fixture.initialize(), null);
  assert.deepEqual(fixture.counts(), [1, 0]);
  assert.equal(fixture.vault().contacts.length, 0);
});
test("vault failure is visible and login recovery retries without duplicate contacts", async () => {
  const fixture = setup({ fail: true });
  await assert.rejects(fixture.initialize(), /Vault conflict/);
  assert.equal(fixture.vault().invitationOnboardingComplete, undefined);
  assert.equal(await fixture.initialize(), "normal-chat");
  assert.equal(fixture.vault().contacts.length, 1);
});
test("network failures and account switches cannot silently complete contact import", async () => {
  for (const options of [{ networkError: true }, { switchAccount: true }]) {
    const fixture = setup(options);
    await assert.rejects(fixture.initialize(), /Offline|Session changed/);
    assert.equal(fixture.vault().invitationOnboardingComplete, undefined);
    assert.equal(fixture.vault().contacts.length, 0);
  }
});
test("malformed/self onboarding is rejected without changing the vault", async () => {
  for (const patch of [
    { inviter: { ...invitation.inviter, id: "invitee" } },
    { inviter: null }, { conversationId: null }, { createdAt: "invalid" },
    { inviterDisplayName: { private: "not a name" } },
  ]) {
    const fixture = setup({ onboarding: { ...invitation, ...patch } });
    await assert.rejects(fixture.initialize(), /Invalid invitation onboarding/);
    assert.deepEqual(fixture.counts(), [1, 0]);
  }
});
test("automatic welcome is visibly labeled and existing navigation no longer names the inviter LoopTalk", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/screens/app/ChatScreen.js"), "utf8");
  assert.match(source, /item\.automaticWelcome && \(/);
  assert.match(source, /t\("messages\.automaticWelcome"\)/);
  assert.match(source, /const mutable = item\.encrypted \|\| conversation\?\.kind === "WELCOME"/);
  const app = fs.readFileSync(path.resolve(__dirname, "../App.js"), "utf8");
  assert.ok(!app.includes('conversationId: welcomeConversationId, name: "LoopTalk"'));
});

test("welcome onboarding opens the inbox once without opening or reading the chat", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../App.js"), "utf8");
  assert.doesNotMatch(app, /\bopenPendingWelcomeConversation\b/);
  assert.match(app, /onStateChange=\{openPendingWelcomeInbox\}/);
  const start = app.indexOf("const openPendingWelcomeInbox = ");
  const end = app.indexOf("\nconst openPendingMessageNotification", start);
  assert.ok(start >= 0 && end > start);
  const navigations = [];
  let ready = false;
  const state = {
    token: "token", welcomeConversationId: "normal-chat",
    clearWelcomeConversation: () => { state.welcomeConversationId = null; },
  };
  const run = vm.runInNewContext(`${app.slice(start, end)}\nopenPendingWelcomeInbox;`, {
    useAuthStore: { getState: () => state },
    navigationRef: {
      isReady: () => ready,
      getRootState: () => ({ routeNames: ["Messages", "Contacts"] }),
      navigate: (...args) => navigations.push(args),
    },
  });
  run();
  assert.equal(state.welcomeConversationId, "normal-chat");
  ready = true;
  run();
  run();
  assert.deepEqual(JSON.parse(JSON.stringify(navigations)), [
    ["Messages", { screen: "MessagesList" }],
  ]);
  assert.equal(state.welcomeConversationId, null);
});

test("site and invitation acceptance use the same centered, screen-limited popup", () => {
  const repository = path.resolve(__dirname, "../..");
  const source = fs.readFileSync(path.join(repository, "public/site/site.js"), "utf8");
  for (const [availWidth, availHeight, width, height] of [[1920, 1080, 520, 850], [400, 700, 400, 700]]) {
    const opened = [];
    let focused = 0;
    const window = {
      screen: { availWidth, availHeight },
      open: (...args) => { opened.push(args); return { focus: () => { focused++; } }; },
    };
    vm.runInNewContext(source, { window, document: { body: {} } });
    window.openLoopTalkClient();
    window.openLoopTalkClient("/app/register?code=INVITE");
    assert.equal(opened[0][0], "/app/");
    assert.equal(opened[1][0], "/app/register?code=INVITE");
    assert.equal(opened[0][2], opened[1][2]);
    assert.ok(opened[0][2].includes(`width=${width},height=${height}`));
    assert.ok(opened[0][2].includes(`left=${Math.round((availWidth - width) / 2)},top=${Math.round((availHeight - height) / 2)}`));
    assert.match(opened[0][2], /noopener=yes/);
    assert.equal(focused, 2);
  }
  assert.match(fs.readFileSync(path.join(repository, "public/site/site.js"), "utf8"),
    /window\.openLoopTalkClient\(\)/);
});
