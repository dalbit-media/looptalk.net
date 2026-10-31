const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const express = require("express");
const { accountId, normalizeIdentifier, credentialFields } = require("../src/utils/privateAccounts");

test("owner-encrypted accounts and opaque routing with isolated SQLite", { timeout: 180000 }, async (t) => {
  const directory = path.join(__dirname, `.private-accounts-${crypto.randomUUID()}`);
  await fs.mkdir(directory);
  const schemaPath = path.join(directory, "schema.prisma");
  const schema = await fs.readFile(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  await fs.writeFile(schemaPath, schema.replace('provider = "prisma-client-js"',
    'provider = "prisma-client-js"\n  output = "./client"\n  engineType = "binary"'));
  const env = { ...process.env, DATABASE_URL: `file:${path.join(directory, "accounts.db")}` };
  let prisma, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (prisma) await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });
  for (const args of [["generate"], ["db", "push", "--skip-generate"]]) {
    const result = spawnSync(process.execPath, [
      require.resolve("prisma/build/index.js"), ...args, "--schema", schemaPath,
    ], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const { PrismaClient } = require(path.join(directory, "client"));
  prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  require.cache[require.resolve("../src/db/client")] = { exports: prisma };
  process.env.JWT_SECRET = "isolated-owner-encrypted-account-tests";
  process.env.USER_DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((_req, res, next) => { res.locals.cspNonce = "test-invitation-nonce"; next(); });
  app.set("io", { to: () => ({ emit: () => {} }) });
  for (const route of ["auth", "users", "contacts", "conversations", "invitations", "media", "reports", "messages"]) {
    app.use(`/api/${route}`, require(`../src/routes/${route}`));
  }
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, { method = "GET", token, body, headers = {} } = {}) => {
    const response = await fetch(origin + "/api" + url, {
      method, headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}), ...headers,
      }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const identity = () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    return { privateKey, publicKey: raw.toString("base64"), id: accountId(raw), accountId: accountId(raw),
      identifier: `${crypto.randomUUID()}@example.test`, credentialSalt: crypto.randomBytes(16).toString("base64") };
  };
  const credentialIdentity = (identifier, password, salt = crypto.randomBytes(16).toString("base64")) => {
    const normalized = normalizeIdentifier(identifier);
    const root = crypto.pbkdf2Sync(password, Buffer.concat([
      Buffer.from(`looptalk-credentials-v1\0${normalized}\0`), Buffer.from(salt, "base64"),
    ]), 600000, 32, "sha256");
    const seed = crypto.createHash("sha512").update(Buffer.concat([
      Buffer.from("looptalk-owner-v1:authentication\0"), root,
    ])).digest().subarray(0, 32);
    const privateKey = crypto.createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
      format: "der", type: "pkcs8",
    });
    root.fill(0);
    seed.fill(0);
    const raw = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
    return { privateKey, publicKey: raw.toString("base64"), id: accountId(raw), accountId: accountId(raw),
      identifier: normalized, credentialSalt: salt };
  };
  const vault = () => ({
    version: 1, nonce: crypto.randomBytes(24).toString("base64"),
    ciphertext: crypto.randomBytes(64).toString("base64"),
  });
  const alice = credentialIdentity("Alice@Example.Test", " Exact Password "), bob = identity();
  const aliceVault = vault(), bobVault = vault();
  let aliceToken, bobToken, sharedInvitationCode, welcomeConversationId;
  const sharedDisplayName = "Alice </p><script>alert(1)</script>";
  const register = async (person, value, invitationCode, extra = {}) => {
    const result = await request("/auth/register", {
      method: "POST", body: { identifier: person.identifier, credentialSalt: person.credentialSalt,
        publicKey: person.publicKey, vault: value, ...(invitationCode ? { invitationCode } : {}), ...extra },
    });
    if (result.status === 200) {
      person.id = result.data.user.id;
      person.username = result.data.user.username;
    }
    return result;
  };
  const challenge = (person, headers) => request("/auth/challenge", {
    method: "POST", body: { accountId: person.accountId }, headers,
  });
  const login = (person, result, extra = {}, headers) => request("/auth/login", {
    method: "POST", body: {
      accountId: person.accountId, challengeId: result.challengeId,
      signature: crypto.sign(null, Buffer.from(result.challenge, "base64"), person.privateKey).toString("base64"), ...extra,
    }, headers,
  });
  await t.test("additive SQL migration preserves existing plaintext records without resetting a database", async () => {
    const legacySchemaPath = path.join(directory, "legacy.prisma");
    await fs.writeFile(legacySchemaPath, schema
      .replace(/^  (authPublicKey|encryptedVault|vaultRevision|authAccountId|credentialSalt|contactLookup|encryptedIdentifier|publicUsername|publicDisplayName|automaticWelcome).*[\r\n]+/gm, "")
      .replace(/model PrivateInvitation \{[^}]+\}[\r\n]*/m, ""));
    const legacyUrl = `file:${path.join(directory, "legacy.db")}`;
    const result = spawnSync(process.execPath, [
      require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", legacySchemaPath,
    ], { env: { ...env, DATABASE_URL: legacyUrl }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const legacyDb = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
    try {
      await legacyDb.$executeRawUnsafe(
        'INSERT INTO "User" ("id","username","email","displayName","updatedAt") VALUES (?,?,?,?,?)',
        "retained-owner", "retained-handle", "retained@example.test", "Retained Name", new Date(),
      );
      const migration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261016090000_private_accounts", "migration.sql"), "utf8");
      for (const statement of migration.split(";").map((value) => value.trim()).filter(Boolean)) {
        await legacyDb.$executeRawUnsafe(statement);
      }
      const credentialMigration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261016095000_credential_accounts", "migration.sql"), "utf8");
      for (const statement of credentialMigration.split(";").map((value) => value.trim()).filter(Boolean)) {
        await legacyDb.$executeRawUnsafe(statement);
      }
      const topologyMigration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261016100000_invitation_topology", "migration.sql"), "utf8");
      for (const statement of topologyMigration.split(";").map((value) => value.trim()).filter(Boolean)) {
        await legacyDb.$executeRawUnsafe(statement);
      }
      const displayNameMigration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261017090000_public_display_names", "migration.sql"), "utf8");
      for (const statement of displayNameMigration.split(";").map((value) => value.trim()).filter(Boolean)) {
        await legacyDb.$executeRawUnsafe(statement);
      }
      const invitationNameMigration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261017060000_invitation_display_name", "migration.sql"), "utf8");
      await legacyDb.$executeRawUnsafe(invitationNameMigration.trim());
      const welcomeMigration = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261017070000_invitation_welcome", "migration.sql"), "utf8");
      await legacyDb.$executeRawUnsafe(welcomeMigration.trim());
      const columns = await legacyDb.$queryRawUnsafe('PRAGMA table_info("Message")');
      assert.equal(columns.find((column) => column.name === "automaticWelcome").notnull, 1n);
      const retained = await legacyDb.user.findUnique({ where: { id: "retained-owner" } });
      assert.equal(retained.email, "retained@example.test");
      assert.equal(retained.displayName, "Retained Name");
      assert.equal(retained.authPublicKey, null);
      assert.equal(retained.encryptedVault, null);
      assert.equal(retained.vaultRevision, 0);
      assert.equal(await legacyDb.privateInvitation.count(), 0);
    } finally {
      await legacyDb.$disconnect();
    }
  });
  await t.test("strict canonical bounded inputs; plaintext registration and social auth explicitly refused", async () => {
    assert.equal((await register(alice, aliceVault, null, { email: "private@example.test" })).status, 426);
    assert.equal((await request("/auth/register", { method: "POST", body: { displayName: "Name", password: "secret" } })).status, 426);
    assert.equal((await request("/auth/register", { method: "POST",
      body: { publicKey: alice.publicKey, vault: aliceVault } })).status, 400);
    for (const value of [
      { ...aliceVault, version: 2 }, { ...aliceVault, nonce: "bad" },
      { ...aliceVault, ciphertext: "YQ==" }, { ...aliceVault, email: "leak" },
      { ...aliceVault, ciphertext: crypto.randomBytes(256 * 1024 + 1).toString("base64") },
    ]) assert.equal((await register(alice, value)).status, 400);
    assert.equal((await register({ publicKey: alice.publicKey.replace(/=+$/, "") }, aliceVault)).status, 400);
    assert.equal((await request("/auth/social", { method: "POST", body: { provider: "google" } })).status, 426);
  });
  await t.test("bootstrap account contains ciphertext, opaque handles, and no readable welcome content", async () => {
    const result = await register(alice, aliceVault);
    assert.equal(result.status, 200);
    aliceToken = result.data.token;
    assert.match(alice.username, /^[a-z]+-[a-z]+-\d{3,4}$/);
    assert.match(alice.id, /^u_[0-9a-f]{32}$/);
    assert.notEqual(alice.username, alice.id);
    assert.deepEqual(result.data.user, { id: alice.id, username: alice.username, displayName: alice.username, member: true });
    assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).publicUsername, alice.username);
    assert.deepEqual(result.data.vault, aliceVault);
    assert.equal(result.data.revision, 1);
    assert.equal(result.data.accountId, alice.accountId);
    assert.notEqual(alice.id, alice.accountId);
    assert.match(alice.id, /^u_[0-9a-f]{32}$/);
    const stored = await prisma.user.findUnique({ where: { id: alice.id } });
    for (const key of ["email", "phoneNumber", "passwordHash", "appleId", "googleId", "bio", "profilePicture"]) {
      assert.equal(stored[key], null);
    }
    assert.equal(await prisma.message.count(), 0);
    assert.equal(await prisma.conversation.count(), 0);
    const guest = credentialIdentity("guest-visitor", "Guest Password 1");
    const guestResult = await register(guest, bobVault);
    assert.equal(guestResult.status, 200);
    assert.equal(guestResult.data.user.member, false);
    assert.equal(guestResult.data.user.username, "guest-visitor");
    const guestToken = guestResult.data.token;
    const invitationCountBeforeGuestRequests = await prisma.invitation.count();
    for (const [url, method, body] of [
      ["/contacts", "GET"],
      [`/contacts/${alice.id}`, "GET"],
      ["/contacts", "POST", { contactUserId: alice.id, groupName: "Family 1" }],
      ["/users/search?q=alice", "GET"],
      ["/invitations", "GET"],
      ["/invitations/stats", "GET"],
      ["/invitations/create", "POST", {}],
      [`/conversations/direct/${alice.id}`, "POST", {}],
      ["/conversations", "POST", { userIds: [alice.id] }],
    ]) {
      const denied = await request(url, { method, token: guestToken, body });
      assert.equal(denied.status, 403, `${method} ${url}`);
      assert.equal(denied.data.code, "MEMBERSHIP_REQUIRED", `${method} ${url}`);
    }
    assert.equal(await prisma.invitation.count(), invitationCountBeforeGuestRequests);
    assert.equal((await register(bob, bobVault, "ZZZZZZZZZZ")).status, 400);
    await prisma.user.delete({ where: { id: guest.id } });
  });
  await t.test("invitation redemption atomically creates inviter CHAT and fixed welcome without plaintext contacts or private profile data", async () => {
    for (const inviterDisplayName of ["", " ", 42, "x".repeat(101), "Alice\nHidden"]) {
      const invalid = await request("/invitations/create", {
        method: "POST", token: aliceToken, body: { inviterDisplayName },
      });
      assert.equal(invalid.status, 400);
    }
    const created = await request("/invitations/create", {
      method: "POST", token: aliceToken, body: { inviterDisplayName: ` ${sharedDisplayName} ` },
    });
    assert.equal(created.status, 201);
    sharedInvitationCode = created.data.code;
    assert.equal(created.data.id, created.data.code);
    assert.equal(created.data.status, "CREATED");
    assert.match(created.data.code, /^[2-9A-HJ-NP-Z]{10}$/);
    const writtenCode = `${created.data.code.slice(0, 5)}-${created.data.code.slice(5)}`.toLowerCase();
    const info = await request(`/invitations/${writtenCode}`);
    assert.equal(info.data.status, "PENDING");
    assert.deepEqual(info.data.inviter, { displayName: sharedDisplayName, username: alice.username });
    assert.equal(Object.hasOwn(info.data.inviter, "id"), false);
    const result = await register(bob, bobVault, writtenCode);
    assert.equal(result.status, 200);
    bobToken = result.data.token;
    welcomeConversationId = result.data.welcomeConversationId;
    assert.match(bob.username, /^[a-z]+-[a-z]+-\d{3,4}$/);
    assert.notEqual(bob.username, alice.username);
    assert.deepEqual((await request(`/users/search?q=${alice.username}`, { token: bobToken })).data,
      [{ id: alice.id, username: alice.username, displayName: alice.username }]);
    assert.deepEqual((await request(`/users/${alice.id}`, { token: bobToken })).data,
      { id: alice.id, username: alice.username, displayName: alice.username });
    const invitation = await prisma.privateInvitation.findUnique({ where: { code: created.data.code } });
    assert.equal(invitation.status, "ACCEPTED");
    assert.equal(invitation.acceptedById, bob.id);
    assert.ok(invitation.acceptedAt instanceof Date);
    assert.equal(invitation.inviteeEmail, undefined);
    assert.equal(invitation.inviterId, alice.id);
    assert.equal(invitation.inviterDisplayName, sharedDisplayName);
    assert.equal((await request(`/invitations/${created.data.code}`)).data.status, "ACCEPTED");
    assert.equal(await prisma.invitation.count(), 0);
    assert.equal(await prisma.contact.count(), 0);
    assert.equal(await prisma.conversation.count(), 1);
    const welcome = await prisma.conversation.findUnique({
      where: { id: welcomeConversationId }, include: { messages: true, participants: true },
    });
    assert.equal(welcome.kind, "CHAT");
    assert.equal(welcome.isGroupChat, false);
    assert.deepEqual(welcome.participants.map((item) => item.userId).sort(), [alice.id, bob.id].sort());
    assert.equal(welcome.messages.length, 1);
    assert.equal(welcome.messages[0].senderId, alice.id);
    assert.equal(welcome.messages[0].messageType, "TEXT");
    assert.equal(welcome.messages[0].automaticWelcome, true);
    assert.equal(welcome.messages[0].content, require("../src/utils/welcomeConversation").INVITATION_WELCOME_MESSAGE);
    assert.ok(welcome.messages[0].content.length < 180);
    const inbox = await request("/conversations", { token: bobToken });
    const inboxWelcome = inbox.data.find((conversation) => conversation.id === welcomeConversationId);
    assert.equal(inboxWelcome.unreadCount, 1);
    assert.equal(inboxWelcome.messages[0].automaticWelcome, true);
    const onboarding = await request("/auth/invitation-onboarding", { token: bobToken });
    assert.equal(onboarding.status, 200);
    assert.deepEqual(onboarding.data.onboarding.inviter, {
      id: alice.id, username: alice.username, displayName: alice.username,
    });
    assert.equal(onboarding.data.onboarding.inviterDisplayName, sharedDisplayName);
    assert.equal(onboarding.data.onboarding.conversationId, welcomeConversationId);
    assert.equal((await request("/auth/invitation-onboarding", { token: aliceToken })).data.onboarding, null);
    assert.equal((await request("/auth/invitation-onboarding")).status, 401);
    const history = await request(`/messages/${welcomeConversationId}`, { token: bobToken });
    assert.equal(history.data[0].automaticWelcome, true);
    assert.equal(history.data[0].sender.username, alice.username);
    const direct = await request(`/conversations/direct/${alice.id}`, { method: "POST", token: bobToken, body: {} });
    assert.equal(direct.data.id, welcomeConversationId);
    assert.equal((await request(`/messages/${welcomeConversationId}/text`, {
      method: "POST", token: bobToken, body: { content: "Must remain encrypted" },
    })).status, 426);
    assert.equal((await register(identity(), vault(), created.data.code)).status, 400);
    const expiredCode = "E".repeat(32);
    await prisma.privateInvitation.create({ data: { code: expiredCode, expiresAt: new Date(0) } });
    assert.equal((await request(`/invitations/${expiredCode}`)).data.status, "EXPIRED");
    assert.equal((await register(identity(), vault(), expiredCode)).status, 400);
    const duplicateCode = "D".repeat(32);
    await prisma.privateInvitation.create({ data: { code: duplicateCode, expiresAt: new Date(Date.now() + 100000) } });
    assert.equal((await register(alice, aliceVault, duplicateCode)).status, 409);
    assert.equal((await prisma.privateInvitation.findUnique({ where: { code: duplicateCode } })).status, "PENDING");
    assert.equal(await prisma.message.count({ where: { automaticWelcome: true } }), 1);
    const map = await request("/invitations/map");
    assert.equal(map.data.mode, "live");
    assert.equal(map.data.nodes.length, 2);
    assert.deepEqual(map.data.nodes.map((node) => node.label).sort(),
      [alice.id.slice(-4), bob.id.slice(-4)].sort());
    assert.ok(!JSON.stringify(map.data).includes(alice.id));
    assert.equal((await request("/invitations/create", {
      method: "POST", token: aliceToken, body: { inviteeEmail: "leak@example.test" },
    })).status, 426);
  });
  await t.test("invitation landing escapes the shared name and uses the site's saved/system theme in every status", async () => {
    const page = await fetch(`${origin}/api/invitations/open/${sharedInvitationCode}`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    assert.match(page.headers.get("content-security-policy"), /style-src 'self' 'unsafe-inline'/);
    assert.match(html, new RegExp(`Alice &lt;/p&gt;&lt;script&gt;alert\\(1\\)&lt;/script&gt; \\(${alice.username}\\)`));
    assert.ok(!html.includes(sharedDisplayName));
    assert.match(html, /<script nonce="test-invitation-nonce" src="\/site\/theme\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\/site\/theme\.css">/);
    assert.match(html, /background: var\(--paper\); color: var\(--ink\)/);
    assert.doesNotMatch(html, /#007aff|#f7fafc|#52606d/);
    assert.ok(html.indexOf("/site/theme.js") < html.indexOf("<body"));

    const expiresAt = new Date(Date.now() + 60000);
    for (const [code, owner] of [
      ["F".repeat(32), alice.id],
      ["A".repeat(32), null],
    ]) {
      await prisma.privateInvitation.create({ data: { code, inviterId: owner, expiresAt } });
      const invitation = await request(`/invitations/${code}`);
      assert.deepEqual(invitation.data.inviter, owner
        ? { username: alice.username, displayName: alice.username } : null);
      const response = await fetch(`${origin}/api/invitations/open/${code}`);
      const landing = await response.text();
      assert.match(landing, /id="accept"/);
      assert.match(landing, new RegExp(`<a id="accept" href="[^"]*/app/register\\?code=${code}" target="_blank" rel="noopener noreferrer">`));
      assert.doesNotMatch(landing, /looptalk:\/\/|openLoopTalkClient|site\/site\.js/);
      const script = landing.match(/<script nonce="test-invitation-nonce">([\s\S]*?)<\/script>/)[1];
      vm.runInNewContext(script, {
        document: { getElementById: () => ({ addEventListener: () => {}, style: {} }) },
        setInterval: () => {},
      });
      assert.match(landing, /\/site\/theme\.css/);
      assert.ok(landing.includes(owner ? `${alice.username} (${alice.username})` : "LoopTalk"));
      await prisma.privateInvitation.delete({ where: { code } });
    }
  });
  await t.test("100 actual users expose only pseudonymous recorded invitation topology", async () => {
    await prisma.user.createMany({ data: Array.from({ length: 98 }, (_, index) => ({
      id: `map-fixture-${index}`, username: `map-fixture-${index}`, displayName: `PRIVATE fixture ${index}`,
    })) });
    const { collectInvitationMap } = require("../src/utils/invitationMap");
    const map = await collectInvitationMap(prisma);
    assert.equal(map.mode, "live");
    assert.equal(map.totalUsers, 100);
    assert.equal(map.nodes.length, 100);
    assert.equal(map.nodes.filter((node) => node.parentId !== null).length, 1);
    for (const secret of [alice.id, bob.id, alice.identifier, "PRIVATE", "map-fixture"]) {
      assert.ok(!JSON.stringify(map).includes(secret));
    }
  });
  await t.test("credential lookup is normalized, encrypted, deterministic for unknowns, and unique", async () => {
    assert.equal(normalizeIdentifier(" +1 (202) 555-0123 "), "+12025550123");
    assert.equal(normalizeIdentifier("+1-202-letters-5550123"), null);
    assert.equal(normalizeIdentifier("202.555.0123"), "2025550123");
    const phoneFields = credentialFields(" +1 (202) 555-0123 ", bob.credentialSalt);
    assert.equal(phoneFields.contactLookup, credentialFields("+12025550123", bob.credentialSalt).contactLookup);
    assert.notEqual(phoneFields.encryptedIdentifier, credentialFields("+12025550123", bob.credentialSalt).encryptedIdentifier);
    const parameters = (identifier) => request("/auth/credential-parameters", { method: "POST", body: { identifier } });
    const found = await parameters(`  ${alice.identifier.toUpperCase()}  `);
    assert.deepEqual(found.data, { salt: alice.credentialSalt, iterations: 600000, version: 1 });
    const missing = await parameters("missing@example.test");
    assert.equal(missing.status, 200);
    assert.equal(Buffer.from(missing.data.salt, "base64").length, 16);
    assert.deepEqual((await parameters(" MISSING@EXAMPLE.TEST ")).data, missing.data);
    assert.notEqual((await parameters("another@example.test")).data.salt, missing.data.salt);
    assert.equal((await parameters("a")).status, 400);
    assert.equal((await parameters("123")).status, 400);
    const stored = await prisma.user.findUnique({ where: { id: alice.id } });
    assert.equal(stored.credentialSalt, alice.credentialSalt);
    assert.equal(stored.authAccountId, alice.accountId);
    assert.match(stored.contactLookup, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(stored).includes(alice.identifier));
    const encrypted = JSON.parse(stored.encryptedIdentifier);
    const decipher = crypto.createDecipheriv("aes-256-gcm",
      Buffer.from(process.env.USER_DATA_ENCRYPTION_KEY, "base64"), Buffer.from(encrypted.nonce, "base64"));
    decipher.setAAD(Buffer.from(`looptalk:identifier:v1:${stored.contactLookup}`));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    assert.equal(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString(), alice.identifier);
    const duplicateCode = "C".repeat(32);
    await prisma.privateInvitation.create({ data: { code: duplicateCode, expiresAt: new Date(Date.now() + 100000) } });
    assert.equal((await register(identity(), vault(), duplicateCode,
      { identifier: ` ${alice.identifier.toUpperCase()} ` })).status, 409);
    assert.equal((await prisma.privateInvitation.findUnique({ where: { code: duplicateCode } })).status, "PENDING");
    assert.equal((await register(identity(), vault(), duplicateCode, { credentialSalt: "weak" })).status, 400);
    assert.equal((await register(identity(), vault(), duplicateCode, { identifier: null })).status, 400);
    assert.equal((await request("/users", { method: "PUT", token: aliceToken,
      body: { identifier: "replacement@example.test", credentialSalt: alice.credentialSalt } })).status, 426);
  });
  await t.test("Ed25519 proof signs exact challenge bytes; replay and wrong-account/origin proofs fail", async () => {
    const proof = (await challenge(alice)).data;
    assert.equal(Buffer.from(proof.challenge, "base64").length, 32);
    const authenticated = await login(alice, proof);
    assert.equal(authenticated.status, 200);
    assert.deepEqual(authenticated.data.vault, aliceVault);
    assert.deepEqual(authenticated.data.user, { id: alice.id, username: alice.username, displayName: alice.username, member: true });
    assert.equal((await login(alice, proof)).status, 401);
    const wrongAccount = (await challenge(alice)).data;
    assert.equal((await login(bob, wrongAccount)).status, 401);
    assert.equal((await login(alice, wrongAccount)).status, 401);
    const wrongSig = (await challenge(alice)).data;
    assert.equal((await login(alice, wrongSig, { signature: crypto.randomBytes(64).toString("base64") })).status, 401);
    assert.equal((await login(alice, wrongSig)).status, 401);
    const originProof = (await challenge(alice, { Origin: "https://client.example" })).data;
    assert.equal((await login(alice, originProof)).status, 401);
    const validOrigin = (await challenge(alice, { Origin: "https://client.example" })).data;
    assert.equal((await login(alice, validOrigin, {}, { Origin: "https://client.example" })).status, 200);
  });
  await t.test("salted credential-derived Ed25519 verifier authenticates the exact password without storing it", async () => {
    const same = credentialIdentity(" ALICE@EXAMPLE.TEST ", " Exact Password ", alice.credentialSalt);
    assert.equal(same.publicKey, alice.publicKey);
    assert.equal((await login(same, (await challenge(same)).data)).status, 200);
    for (const wrong of [
      credentialIdentity(alice.identifier, "Exact Password", alice.credentialSalt),
      credentialIdentity("other@example.test", " Exact Password ", alice.credentialSalt),
      credentialIdentity(alice.identifier, " Exact Password "),
    ]) {
      assert.notEqual(wrong.publicKey, alice.publicKey);
      const proof = (await challenge(alice)).data;
      assert.equal((await login(wrong, proof, { accountId: alice.accountId })).status, 401);
    }
    const unknown = identity();
    assert.equal((await login(unknown, (await challenge(unknown)).data)).status, 401);
    const stored = await prisma.user.findUnique({ where: { id: alice.id } });
    assert.equal(stored.authPublicKey, alice.publicKey);
    assert.equal(stored.passwordHash, null);
    assert.ok(!JSON.stringify(stored).includes(" Exact Password "));
  });
  await t.test("expired challenges cannot authenticate", async (t) => {
    const proof = (await challenge(alice)).data;
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 121000);
    assert.equal((await login(alice, proof)).status, 401);
  });
  await t.test("vault is owner-only and compare-and-set prevents lost updates", async () => {
    assert.equal((await request("/users/vault")).status, 401);
    assert.deepEqual((await request("/users/vault", { token: bobToken })).data, { vault: bobVault, revision: 1 });
    const replacement = vault();
    const results = await Promise.all([replacement, vault()].map((value) => request("/users/vault", {
      method: "PUT", token: aliceToken, body: { vault: value, expectedRevision: 1 },
    })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await request("/users/vault", { token: aliceToken })).data.revision, 2);
    assert.deepEqual((await request("/users/vault", { token: bobToken })).data.vault, bobVault);
    assert.equal((await request("/users/vault", { method: "PUT", token: aliceToken,
      body: { vault: vault(), expectedRevision: 2, userId: bob.id } })).status, 426);
    assert.equal((await request("/users/vault", { method: "PUT", token: aliceToken,
      body: { vault: vault(), expectedRevision: 0 } })).status, 400);
  });
  await t.test("plaintext identity/contact/conversation/upload/report writes fail before storage", async () => {
    for (const [url, method, body] of [
      ["/users", "PUT", { bio: "Secret Bio" }],
      ["/contacts", "POST", { contactUserId: bob.id, groupName: "Family", nickname: "Secret" }],
      [`/contacts/${bob.id}`, "PUT", { nickname: "Secret" }],
      ["/conversations", "POST", { name: "Secret", userIds: [bob.id] }],
      ["/conversations/missing", "PATCH", { name: "Secret" }],
      ["/media/profile-picture", "POST", {}],
      ["/reports", "POST", { reportedUserId: bob.id, category: "OTHER", details: "Secret" }],
    ]) assert.equal((await request(url, { method, token: aliceToken, body })).status, 426, url);
    assert.equal(await prisma.contact.count(), 0);
    assert.equal(await prisma.report.count(), 0);
    const group = await request("/conversations", {
      method: "POST", token: aliceToken, body: { userIds: [bob.id] },
    });
    assert.equal(group.status, 201);
    assert.equal(group.data.name, null);
    const welcome = await prisma.conversation.create({ data: {
      kind: "WELCOME", participants: { create: [{ userId: alice.id }] },
    } });
    assert.equal((await request(`/messages/${welcome.id}`, {
      method: "POST", token: aliceToken, body: { content: "Secret support message" },
    })).status, 426);
  });
  await t.test("legacy peer identity is redacted, name searches disabled, and snapshots contain only routing IDs", async () => {
    const legacy = await prisma.user.create({ data: {
      username: "SecretUsername", displayName: "Secret Name", email: "secret@example.test",
      phoneNumber: "+12025550123", profilePicture: "https://secret.test/avatar", bio: "Secret Bio",
    } });
    const peer = await request(`/users/${legacy.id}`, { token: aliceToken });
    assert.deepEqual(peer.data, { id: legacy.id, username: legacy.id, displayName: legacy.id });
    assert.deepEqual((await request("/users/search?q=Secret", { token: aliceToken })).data, []);
    assert.deepEqual((await request("/users/search?q=SecretUsername", { token: aliceToken })).data, []);
    const exact = await request(`/users/search?q=${bob.id}`, { token: aliceToken });
    assert.equal(exact.data[0].id, bob.id);
    const direct = await request(`/conversations/direct/${legacy.id}`, { method: "POST", token: aliceToken, body: {} });
    assert.equal(direct.status, 201);
    assert.ok(!JSON.stringify(direct.data).includes("Secret"));
    const report = await request("/reports", { method: "POST", token: aliceToken,
      body: { reportedUserId: legacy.id, category: "OTHER", discloseToOperator: true } });
    assert.equal(report.status, 201);
    const stored = await prisma.report.findUnique({ where: { id: report.data.id } });
    assert.deepEqual(JSON.parse(stored.contentSnapshot), { id: legacy.id });
    assert.equal((await request("/reports", { method: "POST", token: aliceToken,
      body: { reportedUserId: bob.id, category: "SPAM" } })).status, 400);
  });
  await t.test("legacy credentials allow explicit owner export/migration, not normal API or new plaintext writes", async () => {
    const { hashPassword } = require("../src/utils/auth");
    const legacy = await prisma.user.create({ data: {
      username: "olduser", displayName: "Owner Secret", email: "owner@example.test",
      passwordHash: await hashPassword("legacy-password"),
      profilePicture: "/uploads/legacy-avatar.webp",
    } });
    const avatarFile = path.join(process.env.UPLOAD_DIR, "legacy-avatar.webp");
    await fs.writeFile(avatarFile, "retain-unattributed-avatar");
    await prisma.contact.create({ data: {
      userId: legacy.id, contactUserId: alice.id, groupName: "Private Family", nickname: "Private Nickname",
    } });
    const incomingContact = await prisma.contact.create({ data: {
      userId: alice.id, contactUserId: legacy.id, groupName: "Other owner's organization",
    } });
    await prisma.invitation.create({ data: {
      inviterId: legacy.id, code: "owner-pending", expiresAt: new Date(Date.now() + 100000),
    } });
    await prisma.invitation.create({ data: {
      inviterId: alice.id, acceptedById: legacy.id, code: "owner-accepted",
      status: "ACCEPTED", expiresAt: new Date(Date.now() + 100000),
    } });
    const historical = await prisma.conversation.create({ data: {
      name: "Legacy readable topic",
      participants: { create: [{ userId: legacy.id }, { userId: alice.id }] },
      messages: { create: { senderId: legacy.id, content: "Legacy readable history" } },
    } });
    const anonymousInvitationCount = await prisma.privateInvitation.count();
    const oldLogin = await request("/auth/login", { method: "POST", body: { identifier: "olduser", password: "legacy-password" } });
    assert.equal(oldLogin.status, 426);
    const scoped = await request("/auth/legacy-login", { method: "POST", body: { identifier: "olduser", password: "legacy-password" } });
    assert.equal(scoped.status, 200);
    assert.equal(scoped.data.migrationRequired, true);
    const token = scoped.data.token;
    assert.equal((await request("/users/vault", { token })).status, 426);
    assert.equal((await request("/conversations", { token })).status, 426);
    const exported = await request("/auth/legacy-data", { token });
    assert.equal(exported.data.profile.email, "owner@example.test");
    assert.equal(exported.data.contacts[0].nickname, "Private Nickname");
    const newIdentity = identity(), encrypted = vault();
    const missingAvatarAcknowledgement = await request("/auth/migrate", { method: "POST", token, body: {
      publicKey: newIdentity.publicKey, vault: encrypted, confirmation: "ENCRYPT_AND_REMOVE_LEGACY_PROFILE",
    } });
    assert.equal(missingAvatarAcknowledgement.status, 400);
    assert.equal(missingAvatarAcknowledgement.data.code, "AVATAR_IMPORT_REQUIRED");
    assert.equal(await prisma.contact.count({ where: { userId: legacy.id } }), 1);
    assert.equal(await prisma.invitation.count({ where: { inviterId: legacy.id } }), 1);
    assert.equal((await prisma.user.findUnique({ where: { id: legacy.id } })).authPublicKey, null);
    const migration = await request("/auth/migrate", { method: "POST", token, body: {
      publicKey: newIdentity.publicKey, vault: encrypted, confirmation: "ENCRYPT_AND_REMOVE_LEGACY_PROFILE",
      avatarImported: true, identifier: " Owner@Example.Test ", credentialSalt: newIdentity.credentialSalt,
    } });
    assert.equal(migration.status, 200);
    assert.equal(migration.data.user.id, legacy.id);
    assert.equal(migration.data.accountId, newIdentity.id);
    assert.equal(migration.data.legacyHistoryRetained, true);
    assert.equal(migration.data.user.username, legacy.id);
    assert.equal(migration.data.avatarCleanup.status, "retained-unsafe");
    assert.match(migration.data.avatarCleanup.error, /ownership/);
    assert.equal(await fs.readFile(avatarFile, "utf8"), "retain-unattributed-avatar");
    assert.equal(migration.data.legacyContactsRemoved, 1);
    assert.equal(migration.data.legacyInvitationEdgesRemoved, 0);
    assert.equal(migration.data.legacyInvitationContactsCleared, 2);
    assert.equal(await prisma.contact.count({ where: { userId: legacy.id } }), 0);
    assert.ok(await prisma.contact.findUnique({ where: { id: incomingContact.id } }));
    assert.equal(await prisma.invitation.count({
      where: { OR: [{ inviterId: legacy.id }, { acceptedById: legacy.id }] },
    }), 2);
    assert.equal(await prisma.privateInvitation.count(), anonymousInvitationCount);
    assert.equal(await prisma.message.count({ where: { conversationId: historical.id, content: "Legacy readable history" } }), 1);
    const stored = await prisma.user.findUnique({ where: { id: legacy.id } });
    assert.equal(stored.email, null);
    assert.equal(stored.passwordHash, null);
    assert.equal(stored.profilePicture, null);
    assert.ok(stored.encryptedIdentifier);
    assert.ok(!JSON.stringify(stored).includes("owner@example.test"));
    assert.deepEqual((await request("/auth/credential-parameters", { method: "POST",
      body: { identifier: "owner@example.test" } })).data,
    { salt: newIdentity.credentialSalt, iterations: 600000, version: 1 });
    assert.equal((await request("/auth/migrate", { method: "POST", token, body: {
      publicKey: newIdentity.publicKey, vault: encrypted, confirmation: "ENCRYPT_AND_REMOVE_LEGACY_PROFILE",
      identifier: "other@example.test", credentialSalt: newIdentity.credentialSalt,
    } })).status, 409);
    assert.equal((await request("/auth/legacy-data", { token })).status, 409);
    const proof = (await challenge(newIdentity)).data;
    const recovered = await login(newIdentity, proof);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.data.user.id, legacy.id);
    assert.equal(recovered.data.user.username, legacy.id);
    assert.deepEqual(recovered.data.vault, encrypted);
    assert.equal(recovered.data.revision, 1);
    assert.equal(require("jsonwebtoken").verify(recovered.data.token, process.env.JWT_SECRET).id, legacy.id);
    const me = await request("/auth/me", { token: recovered.data.token });
    assert.equal(me.data.id, legacy.id);
    assert.equal(me.data.username, legacy.id);
  });
  await t.test("optional public usernames are exact, case-insensitive, unique and never change routing or login", async () => {
    const reserve = (token, username, extra = {}) => request("/users", {
      method: "PUT", token, body: { username, ...extra },
    });
    for (const username of ["ab", "with space", "éclair", "x".repeat(25), alice.id, null]) {
      assert.equal((await reserve(aliceToken, username)).status, 400);
    }
    assert.equal((await reserve(aliceToken, "Public_Alice", { id: bob.id })).status, 426);
    const reserved = await reserve(aliceToken, "Public_Alice");
    assert.equal(reserved.status, 200);
    assert.deepEqual(reserved.data.user, { id: alice.id, username: "public_alice", displayName: "public_alice" });
    assert.deepEqual((await request(`/invitations/${sharedInvitationCode}`)).data.inviter,
      { displayName: sharedDisplayName, username: "public_alice" });
    assert.equal((await reserve(bobToken, "PUBLIC_ALICE")).status, 409);
    assert.equal((await prisma.user.findUnique({ where: { id: bob.id } })).publicUsername, bob.username);
    assert.deepEqual((await request("/users/search?q=public", { token: bobToken })).data, []);
    const exact = await request("/users/search?q=PUBLIC_ALICE", { token: bobToken });
    assert.deepEqual(exact.data, [{ id: alice.id, username: "public_alice", displayName: "public_alice" }]);
    assert.deepEqual((await request("/users/search?q=%40PUBLIC_ALICE", { token: bobToken })).data, exact.data);
    assert.deepEqual((await request(`/users/${alice.id}`, { token: bobToken })).data, exact.data[0]);
    const direct = await request(`/conversations/direct/${alice.id}`, {
      method: "POST", token: bobToken, body: {},
    });
    assert.ok([200, 201].includes(direct.status));
    const assertPublicParticipants = (conversation) => {
      const peer = conversation.participants.find((participant) => participant.userId === alice.id);
      assert.deepEqual(peer.user, { id: alice.id, username: "public_alice", displayName: "public_alice" });
      const self = conversation.participants.find((participant) => participant.userId === bob.id);
      assert.deepEqual(self.user, { id: bob.id, username: bob.username, displayName: bob.username });
      assert.ok(!JSON.stringify(conversation).includes(alice.identifier));
      assert.ok(!JSON.stringify(conversation).includes(alice.publicKey));
    };
    assertPublicParticipants(direct.data);
    const listed = await request("/conversations", { token: bobToken });
    assert.equal(listed.status, 200);
    assertPublicParticipants(listed.data.find((conversation) => conversation.id === direct.data.id));
    const detail = await request(`/conversations/${direct.data.id}`, { token: bobToken });
    assert.equal(detail.status, 200);
    assertPublicParticipants(detail.data);
    const { sanitizeIdentity } = require("../src/utils/privateAccounts");
    assert.equal(sanitizeIdentity(sanitizeIdentity({
      id: alice.id, username: "public_alice", publicUsername: "public_alice", displayName: "Private Name",
    })).username, "public_alice");
    assert.equal((await request(`/users/search?q=${alice.identifier}`, { token: bobToken })).data.length, 0);
    const authenticated = await login(alice, (await challenge(alice)).data);
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.data.user.id, alice.id);
    assert.equal(authenticated.data.accountId, alice.accountId);
    assert.equal((await request(`/users/${alice.id}/block`, { method: "POST", token: bobToken, body: {} })).status, 200);
    assert.deepEqual((await request("/users/search?q=public_alice", { token: bobToken })).data, []);
    await request(`/users/${alice.id}/unblock`, { method: "POST", token: bobToken, body: {} });
    const adapter = await request("/users", { method: "PUT", token: bobToken,
      body: { vault: vault(), expectedRevision: 1 } });
    assert.equal(adapter.status, 200);
    assert.equal(adapter.data.revision, 2);
  });
  await t.test("existing manual-key accounts retain canonical challenge login without contact binding", async () => {
    const manual = identity(), encrypted = vault();
    await prisma.user.create({ data: {
      id: manual.id, username: manual.accountId, displayName: manual.id,
      authPublicKey: manual.publicKey, encryptedVault: JSON.stringify(encrypted), vaultRevision: 1,
    } });
    const authenticated = await login(manual, (await challenge(manual)).data);
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.data.user.id, manual.id);
    assert.equal(authenticated.data.accountId, manual.accountId);
    assert.deepEqual(authenticated.data.vault, encrypted);
    const stored = await prisma.user.findUnique({ where: { id: manual.id } });
    assert.equal(stored.credentialSalt, null);
    assert.equal((await request("/auth/migrate", { method: "POST", token: authenticated.data.token, body: {
      publicKey: manual.publicKey, vault: encrypted, confirmation: "ENCRYPT_AND_REMOVE_LEGACY_PROFILE",
      identifier: "takeover@example.test", credentialSalt: manual.credentialSalt,
    } })).status, 409);
  });
  await t.test("published display names reach profiles, search, contacts and chat without exposing private fields", async (t) => {
    const nextWindow = Date.now() + 16 * 60 * 1000;
    t.mock.method(Date, "now", () => nextWindow);
    for (const displayName of ["", " ", "x".repeat(101), 123, null, "bad\nname"]) {
      assert.equal((await request("/users", {
        method: "PUT", token: aliceToken, body: { displayName },
      })).status, 400);
      assert.equal((await register(identity(), vault(), undefined, { displayName })).status, 400);
    }
    const publicName = "Alice Public";
    const updated = await request("/users", {
      method: "PUT", token: aliceToken, body: { displayName: `  ${publicName}  ` },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.user.displayName, publicName);
    const stored = await prisma.user.findUnique({ where: { id: alice.id } });
    assert.equal(stored.publicDisplayName, publicName);
    assert.equal(stored.displayName, alice.username, "Legacy private field is not republished");
    const expected = { id: alice.id, username: "public_alice", displayName: publicName };
    assert.deepEqual((await request(`/users/${alice.id}`, { token: bobToken })).data, expected);
    assert.deepEqual((await request("/users/search?q=public_alice", { token: bobToken })).data, [expected]);
    assert.deepEqual((await request("/users/profiles", {
      method: "POST", token: bobToken, body: { userIds: [alice.id, "unknown"] },
    })).data, [expected]);
    assert.equal((await request("/users/profiles", {
      method: "POST", token: bobToken, body: { userIds: Array(201).fill(alice.id) },
    })).status, 400);
    const direct = await request(`/conversations/direct/${alice.id}`, {
      method: "POST", token: bobToken, body: {},
    });
    assert.deepEqual(direct.data.participants.find((p) => p.userId === alice.id).user, expected);
    const list = (await request("/conversations", { token: bobToken })).data;
    assert.deepEqual(list.find((c) => c.id === direct.data.id).participants.find((p) => p.userId === alice.id).user, expected);
    const history = await request(`/messages/${direct.data.id}`, { token: bobToken });
    assert.equal(history.status, 200);
    assert.equal(JSON.stringify(history.data).includes(publicName), true);
    const { opaqueUser, sanitizeIdentity } = require("../src/utils/privateAccounts");
    assert.deepEqual(JSON.parse(JSON.stringify(sanitizeIdentity(sanitizeIdentity(opaqueUser(stored))))), expected);
    assert.equal(sanitizeIdentity({ id: "legacy", username: "secret", displayName: "Hidden" }).displayName, "legacy");
    assert.equal((await login(alice, (await challenge(alice)).data)).data.user.displayName, publicName);

    const code = crypto.randomBytes(16).toString("hex").toUpperCase();
    t.after(() => prisma.privateInvitation.deleteMany({ where: { code } }));
    await prisma.privateInvitation.create({ data: {
      code, inviterId: alice.id, expiresAt: new Date(Date.now() + 60000),
    } });
    const registered = await register(identity(), vault(), code, { displayName: "New Public Name" });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.user.displayName, "New Public Name");
    assert.equal((await prisma.user.findUnique({ where: { id: registered.data.user.id } })).publicDisplayName, "New Public Name");
  });
  await t.test("a signed-in guest can join the network later with an invitation", async () => {
    const guest = credentialIdentity("late-joiner", "Guest Password 1");
    const registered = await register(guest, bobVault);
    assert.equal(registered.data.user.member, false);
    const guestToken = registered.data.token;
    const join = (code, token = guestToken) => request("/auth/join-network", { method: "POST", token, body: { invitationCode: code } });
    const codes = Object.fromEntries(['self', 'expired', 'good', 'extra'].map((name) => [name, crypto.randomBytes(16).toString('hex').toUpperCase()]));
    const expiresAt = new Date(Date.now() + 60000);
    const invitation = (code, inviterId = alice.id, extra = {}) =>
      prisma.privateInvitation.create({ data: { code, inviterId, expiresAt, ...extra } });

    assert.equal((await request("/auth/join-network", { method: "POST", body: { invitationCode: "X" } })).status, 401);
    assert.equal((await join("NOTAREALCODE")).status, 400);
    assert.equal((await request("/auth/join-network", { method: "POST", token: guestToken, body: {} })).status, 400);
    await invitation(codes.self, guest.id);
    assert.equal((await join(codes.self)).status, 400);
    await invitation(codes.expired, alice.id, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await join(codes.expired)).status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: guest.id } })).isMember, false);

    await invitation(codes.good);
    const joined = await join(codes.good.toLowerCase());
    assert.equal(joined.status, 200);
    assert.equal(joined.data.user.member, true);
    assert.equal(typeof joined.data.welcomeConversationId, "string");
    assert.equal((await prisma.user.findUnique({ where: { id: guest.id } })).isMember, true);
    const used = await prisma.privateInvitation.findUnique({ where: { code: codes.good } });
    assert.equal(used.status, "ACCEPTED");
    assert.equal(used.acceptedById, guest.id);
    const onboarding = await request("/auth/invitation-onboarding", { token: guestToken });
    assert.equal(onboarding.data.onboarding.conversationId, joined.data.welcomeConversationId);

    await invitation(codes.extra);
    assert.equal((await join(codes.extra)).status, 409);
    const other = credentialIdentity("other-guest", "Guest Password 1");
    const otherResult = await register(other, bobVault);
    assert.equal((await join(codes.good, otherResult.data.token)).status, 400);
    await prisma.privateInvitation.deleteMany({ where: { code: { in: Object.values(codes) } } });
    await prisma.user.deleteMany({ where: { id: { in: [other.id] } } });
  });
  await t.test("Apple/Google sign-in is optional recovery: it links at signup and only replaces the device key", async () => {
    const jwt = require("jsonwebtoken");
    const { setKeyFetcher } = require("../src/utils/socialIdentity");
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
    setKeyFetcher(async () => [jwk]);
    process.env.GOOGLE_CLIENT_IDS = "google-client, other-client";
    delete process.env.APPLE_CLIENT_IDS;
    const sign = (sub, overrides = {}) => jwt.sign({ sub }, privateKey, {
      algorithm: "RS256", keyid: "test-key", issuer: "https://accounts.google.com",
      audience: "google-client", expiresIn: 300, ...overrides,
    });
    const social = (token, provider = "google") => ({ social: { provider, idToken: token } });
    const recover = (token, person, provider = "google") => request("/auth/social-recover", { method: "POST",
      body: { provider, idToken: token, publicKey: person.publicKey, vault: vault() } });
    try {
      const device = identity();
      const forged = [sign("g-1", { audience: "someone-else" }), sign("g-1", { issuer: "https://evil.test" }),
        sign("g-1", { expiresIn: -10 }), sign("g-1", { keyid: "unknown" }), "not-a-token"];
      for (const token of forged) assert.equal((await register(device, vault(), null, social(token))).status, 401);
      assert.equal((await register(device, vault(), null, social(sign("g-1"), "apple"))).status, 503);
      assert.equal((await register(device, vault(), null, { social: { provider: "google" } })).status, 400);

      const first = await register(device, vault(), null, social(sign("g-1")));
      assert.equal(first.status, 200);
      assert.equal(first.data.user.member, false);
      const stored = await prisma.user.findUnique({ where: { id: device.id } });
      assert.match(stored.googleId, /^[0-9a-f]{64}$/);
      assert.ok(!stored.googleId.includes("g-1"));
      const duplicate = await register(identity(), vault(), null, social(sign("g-1")));
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.data.code, "SOCIAL_ACCOUNT_EXISTS");

      assert.equal((await recover(sign("never-linked"), identity())).status, 404);
      assert.equal((await recover(sign("g-1", { audience: "someone-else" }), identity())).status, 401);
      const replacement = identity();
      const recovered = await recover(sign("g-1"), replacement);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.data.user.id, device.id);
      assert.equal(recovered.data.accountId, replacement.accountId);
      assert.equal(recovered.data.revision, stored.vaultRevision + 1);
      assert.equal((await login(replacement, await challenge(replacement).then((r) => r.data))).status, 200);
      assert.equal((await login(device, await challenge(device).then((r) => r.data))).status, 401);
    } finally {
      setKeyFetcher(async () => { throw new Error("unconfigured"); });
      delete process.env.GOOGLE_CLIENT_IDS;
    }
  });
  await t.test("device tokens and account deletion still work", async () => {
    assert.equal((await request("/auth/device-token", { method: "POST", token: bobToken,
      body: { token: "opaque-device-token", platform: "web" } })).status, 400);
    const subscription = JSON.stringify({ endpoint: "https://push.example/abc", keys: { p256dh: "a", auth: "b" } });
    assert.equal((await request("/auth/device-token", { method: "POST", token: bobToken,
      body: { token: subscription, platform: "web" } })).status, 200);
    assert.equal((await request("/auth/device-token", { method: "DELETE", token: bobToken })).status, 200);
    const bobInvitation = await prisma.privateInvitation.create({ data: {
      code: "B".repeat(32), inviterId: bob.id, inviterDisplayName: "Shared Bob",
      expiresAt: new Date(Date.now() + 60000),
    } });
    assert.equal((await request("/auth/account", { method: "DELETE", token: bobToken, body: { confirmation: "DELETE" } })).status, 200);
    assert.equal(await prisma.user.findUnique({ where: { id: bob.id } }), null);
    assert.equal(await prisma.deviceToken.count({ where: { userId: bob.id } }), 0);
    assert.equal((await prisma.privateInvitation.findUnique({ where: { code: bobInvitation.code } })).inviterDisplayName, null);
    assert.equal((await request(`/invitations/${bobInvitation.code}`)).data.inviter, null);
    await prisma.privateInvitation.delete({ where: { code: bobInvitation.code } });
  });
  await t.test("private accounts never persist or publish online activity timestamps", async () => {
    const { createPresenceService } = require("../src/utils/presence");
    const broadcasts = [], snapshots = [];
    const socket = {
      userId: alice.id, data: {}, handshake: { auth: { presenceActive: true } },
      connected: true, emit: (event, payload) => snapshots.push({ event, payload }),
    };
    const presence = createPresenceService({
      prisma, io: {
        fetchSockets: async () => [socket],
        in: () => ({ fetchSockets: async () => [socket] }),
        emit: (event, payload) => broadcasts.push({ event, payload }),
      },
    });
    await presence.connect(socket);
    await presence.setActive(socket, "online");
    await presence.setActive(socket, "offline");
    await presence.disconnect(socket);
    assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).lastActiveAt, null);
    assert.deepEqual(broadcasts.map(({ event, payload }) => {
      assert.equal(event, "user_status_changed");
      assert.equal(Object.hasOwn(payload, "lastActiveAt"), false);
      return payload.status;
    }), ["online", "online", "offline", "offline"]);
    assert.deepEqual(snapshots[0].payload.users, [{ userId: alice.id, status: "online" }]);
    assert.equal(socket.data.lastActiveAt, undefined);
    const profile = await request(`/users/${alice.id}`, { token: aliceToken });
    assert.equal(profile.data.lastActiveAt, undefined);
    assert.equal(profile.data.status, undefined);
  });
  await t.test("anonymous and deleted inviters never become fake contacts or welcome senders", async () => {
    const count = await prisma.message.count({ where: { automaticWelcome: true } });
    const contactCount = await prisma.contact.count();
    for (const inviterId of [null, "deleted-invitation-issuer"]) {
      const code = crypto.randomBytes(16).toString("hex").toUpperCase();
      await prisma.privateInvitation.create({ data: {
        code, inviterId, expiresAt: new Date(Date.now() + 100000),
      } });
      const invitee = identity();
      const response = await register(invitee, vault(), code);
      assert.equal(response.status, 200);
      assert.equal(response.data.welcomeConversationId, null);
      assert.equal((await request("/auth/invitation-onboarding", { token: response.data.token })).data.onboarding, null);
    }
    assert.equal(await prisma.message.count({ where: { automaticWelcome: true } }), count);
    assert.equal(await prisma.contact.count(), contactCount);
  });
  await t.test("challenge and login attempts are rate limited", async () => {
    let limited = false;
    for (let i = 0; i < 65; i += 1) {
      if ((await challenge(alice)).status === 429) { limited = true; break; }
    }
    assert.equal(limited, true);
    assert.equal((await request("/auth/login", { method: "POST", body: {} })).status, 429);
  });
  await t.test("concurrent private invitations preserve the per-owner cap without storing issuer links", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => request("/invitations/create", {
      method: "POST", token: aliceToken, body: {},
    })));
    assert.equal(results.filter((result) => result.status === 201).length, 4);
    assert.equal(results.filter((result) => result.status === 429).length, 2);
    assert.deepEqual((await request("/invitations", { token: aliceToken })).data, []);
    assert.equal((await request("/invitations/stats", { token: aliceToken })).data.linksShared, 5);
  });
});
