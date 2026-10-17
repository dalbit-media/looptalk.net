const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const express = require("express");

test("retained legacy welcome conversations and administrator reply tracking", async (t) => {
  const directory = path.join(__dirname, `.legacy-welcome-${crypto.randomUUID()}`);
  await fs.mkdir(directory);
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.JWT_SECRET = "welcome-test-secret-not-for-production";
  process.env.GOOGLE_WEB_CLIENT_ID = "test-google-client";
  process.env.APPLE_CLIENT_ID = "test-apple-client";
  const prisma = require("../src/db/client");
  let server;
  t.after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const setup = spawnSync(process.execPath, [
    require.resolve("prisma/build/index.js"),
    "db", "push",
    "--schema", path.resolve(__dirname, "..", "prisma", "schema.prisma"),
    "--skip-generate",
  ], { env: process.env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.error?.message || setup.stderr || setup.stdout);

  const events = [];
  const app = express();
  app.use(express.json());
  app.set("io", {
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  });
  app.use("/api/auth", require("../src/routes/auth"));
  app.use("/api/conversations", require("../src/routes/conversations"));
  app.use("/api/messages", require("../src/routes/messages"));
  app.use("/api/users", require("../src/routes/users"));
  app.use("/api/invitations", require("../src/routes/invitations"));
  app.use("/api/admin", require("../src/routes/admin"));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, { token, method = "GET", body } = {}) => {
    const response = await fetch(`${origin}${url}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  const register = (email, invitationCode) => request("/api/auth/register", {
    method: "POST",
    body: { email, password: "test-password", displayName: email.split("@")[0], invitationCode },
  });
  const legacyFixture = async (id) => {
    const user = await prisma.user.create({ data: { id, username: id, displayName: id } });
    return { user, token: require("../src/utils/auth").generateToken(user.id) };
  };
  const invite = async (code, inviterId) => {
    await prisma.invitation.create({
      data: { code, inviterId, expiresAt: new Date(Date.now() + 60_000) },
    });
    return code;
  };

  let admin;
  let member;
  let welcome;
  let reply;

  await t.test("legacy bootstrap fixture has no welcome conversation or system account", async () => {
    const { upgradeWelcomeConversations, LOOPTALK_USER_ID } = require("../src/utils/welcomeConversation");
    await upgradeWelcomeConversations(prisma);
    assert.equal(await prisma.user.count(), 0);
    admin = await legacyFixture("legacy-admin");
    process.env.ADMIN_USER_IDS = admin.user.id;
    assert.equal(admin.welcomeConversationId, undefined);
    assert.equal(await prisma.user.count({ where: { status: { not: "SYSTEM" } } }), 1);
    const sender = await prisma.user.findUnique({ where: { id: LOOPTALK_USER_ID } });
    assert.equal(sender, null);
    const list = await request("/api/conversations", { token: admin.token });
    assert.deepEqual(list.data, []);
    const overview = await request("/api/admin/public-overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.data.counts.users, 1);
    assert.equal(overview.data.storage.unreadDeliveries, 0);
    assert.equal(overview.data.replies, undefined);
    assert.equal(JSON.stringify(overview.data).includes("Welcome to LoopTalk!"), false);
    assert.deepEqual((await request("/api/users/search?q=LoopTalk", { token: admin.token })).data, []);
  });

  await t.test("existing inviter-authored legacy welcome and invitation edge remain readable", async () => {
    const code = await invite("password-invite", admin.user.id);
    member = await legacyFixture("legacy-member");
    await prisma.invitation.update({ where: { code }, data: { status: "ACCEPTED", acceptedById: member.user.id } });
    await prisma.conversation.create({ data: {
      participants: { create: [{ userId: admin.user.id }, { userId: member.user.id }] },
      messages: { create: { senderId: admin.user.id, content: require("../src/utils/welcomeConversation").WELCOME_MESSAGE } },
    } });
    const acceptedInvitation = await prisma.invitation.findUnique({ where: { code } });
    assert.equal(acceptedInvitation.acceptedById, member.user.id);
    const map = await request("/api/invitations/map");
    assert.equal(map.status, 200);
    assert.equal(map.data.mode, "live");
    assert.equal(map.data.totalUsers, 2);
    const list = await request("/api/conversations", { token: member.token });
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].kind, "CHAT");
    assert.equal(list.data[0].participants.length, 2);
    assert.equal(list.data[0].messages.length, 1);
    assert.equal(list.data[0].messages[0].messageType, "TEXT");
    assert.equal(list.data[0].messages[0].senderId, admin.user.id);
    assert.equal(list.data[0].messages[0].sender.id, admin.user.id);
    assert.equal(list.data[0].messages[0].sender.displayName, admin.user.id);
    assert.match(list.data[0].messages[0].content, /Welcome to LoopTalk!/);
    assert.match(list.data[0].messages[0].content, /person who invited you/);
    const count = await prisma.conversation.count();
    const login = await request("/api/auth/login", {
      method: "POST", body: { identifier: "member@example.com", password: "test-password" },
    });
    assert.equal(login.status, 426);
    assert.equal(login.data.welcomeConversationId, undefined);
    assert.equal(await prisma.conversation.count(), count);
    const direct = await request(`/api/conversations/direct/${member.user.id}`, {
      method: "POST", token: admin.token,
    });
    assert.equal(direct.data.kind, "CHAT");
    assert.equal(direct.data.participants.length, 2);
    assert.equal(direct.data.id, list.data[0].id);
    assert.equal(await prisma.conversation.count(), count);
  });

  await t.test("Google and Apple signup no longer create readable identities or welcomes", async () => {
    for (const provider of ["google", "apple"]) {
      const invitationCode = await invite(`${provider}-invite`, admin.user.id);
      const body = { provider, idToken: `${provider}-member`, invitationCode };
      const signup = await request("/api/auth/social", { method: "POST", body });
      assert.equal(signup.status, 426);
      assert.equal((await prisma.invitation.findUnique({ where: { code: invitationCode } })).acceptedById, null);
      const count = await prisma.conversation.count();
      const login = await request("/api/auth/social", { method: "POST", body });
      assert.equal(login.status, 426);
      assert.equal(await prisma.conversation.count(), count);
    }
  });

  await t.test("legacy welcome threads remain available for feedback replies", async () => {
    const { createWelcomeConversation } = require("../src/utils/welcomeConversation");
    const created = await prisma.$transaction((tx) => createWelcomeConversation(tx, member.user.id));
    welcome = await prisma.conversation.findUnique({
      where: { id: created.id },
      include: { messages: true },
    });
    member.welcomeConversationId = welcome.id;
  });

  await t.test("rejected signup leaves no account or welcome behind", async () => {
    const count = await prisma.conversation.count();
    const result = await register("rejected@example.com", "invalid-code");
    assert.equal(result.status, 426);
    assert.equal(await prisma.user.count({ where: { email: "rejected@example.com" } }), 0);
    assert.equal(await prisma.conversation.count(), count);
  });

  await t.test("welcome creation failure rolls back signup", async () => {
    const { createWelcomeConversation } = require("../src/utils/welcomeConversation");
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: "rollback", displayName: "Rollback" } });
      await createWelcomeConversation(tx, `${user.id}-missing`);
    }));
    assert.equal(await prisma.user.count({ where: { username: "rollback" } }), 0);
  });

  await t.test("welcome thread remains private and the LoopTalk message cannot be edited or deleted by its recipient", async () => {
    assert.equal((await request(`/api/messages/${member.welcomeConversationId}`, { token: admin.token })).status, 403);
    assert.equal((await request(`/api/conversations/${member.welcomeConversationId}`, { token: admin.token })).status, 403);
    const id = welcome.messages[0].id;
    assert.equal((await request(`/api/messages/${welcome.id}/${id}`, {
      token: admin.token, method: "PUT", body: { content: "Changed" },
    })).status, 403);
    assert.equal((await request(`/api/messages/${welcome.id}/${id}`, {
      token: admin.token, method: "DELETE",
    })).status, 403);
  });

  await t.test("users can reply normally, with realtime relay and idempotent retries", async () => {
    const body = { content: "How do I invite my family?", clientMessageId: "welcome-test-reply-001" };
    const result = await request(`/api/messages/${member.welcomeConversationId}/text`, {
      token: member.token, method: "POST", body,
    });
    assert.equal(result.status, 201);
    reply = result.data;
    assert.equal(reply.senderId, member.user.id);
    assert.ok(events.some((event) => event.event === "new_message" && event.payload.id === reply.id));
    const retry = await request(`/api/messages/${member.welcomeConversationId}/text`, {
      token: member.token, method: "POST", body,
    });
    assert.equal(retry.data.id, reply.id);
    assert.equal(await prisma.message.count({ where: { conversationId: member.welcomeConversationId } }), 2);
  });

  await t.test("only administrators can list welcome replies", async () => {
    assert.equal((await request("/api/admin/welcome-replies")).status, 401);
    assert.equal((await request("/api/admin/welcome-replies", { token: member.token })).status, 403);
    const result = await request("/api/admin/welcome-replies", { token: admin.token });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.data.replies.length, 1);
    assert.equal(result.data.replies[0].content, reply.content);
    assert.equal(result.data.replies[0].sender.id, member.user.id);
    assert.equal(result.data.replies[0].sender.email, undefined);
    assert.equal(result.data.nextCursor, null);
  });

  await t.test("inbox pagination is stable, excludes normal chats and includes edits/deletions/media", async () => {
    const timestamp = new Date();
    for (const [id, data] of [
      ["pagination-1", { content: "Older reply", messageType: "TEXT" }],
      ["pagination-2", { content: null, messageType: "IMAGE", mediaUrl: "/uploads/test.webp" }],
      ["pagination-3", { content: "Edited reply", messageType: "TEXT", editedAt: timestamp }],
      ["pagination-4", { content: null, messageType: "TEXT", deletedAt: timestamp }],
    ]) {
      await prisma.message.create({
        data: { id, conversationId: member.welcomeConversationId, senderId: member.user.id, createdAt: timestamp, ...data },
      });
    }
    const normal = await prisma.conversation.findFirst({ where: { kind: "CHAT" } });
    await prisma.message.create({
      data: { conversationId: normal.id, senderId: member.user.id, content: "Not welcome feedback" },
    });
    const ids = [];
    let cursor = null;
    do {
      const result = await request(`/api/admin/welcome-replies?limit=2${cursor ? `&before=${cursor}` : ""}`, { token: admin.token });
      assert.equal(result.status, 200);
      ids.push(...result.data.replies.map((item) => item.id));
      cursor = result.data.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    assert.deepEqual(ids.slice(0, 4), ["pagination-4", "pagination-3", "pagination-2", "pagination-1"]);
    const result = await request("/api/admin/welcome-replies", { token: admin.token });
    assert.ok(result.data.replies.find((item) => item.id === "pagination-4").deletedAt);
    assert.ok(result.data.replies.find((item) => item.id === "pagination-3").editedAt);
    assert.equal(result.data.replies.find((item) => item.id === "pagination-2").mediaUrl, "/uploads/test.webp");
    for (const query of ["limit=0", "limit=101", "limit=abc", "limit=1.5", "before=missing", "before="]) {
      assert.equal((await request(`/api/admin/welcome-replies?${query}`, { token: admin.token })).status, 400);
    }
  });

  await t.test("account deletion removes its welcome conversation and replies", async () => {
    const deleted = await request("/api/auth/account", {
      token: member.token, method: "DELETE", body: { confirmation: "DELETE" },
    });
    assert.equal(deleted.status, 200);
    assert.equal((await prisma.invitation.findUnique({ where: { code: "password-invite" } })).acceptedById, null);
    assert.equal(await prisma.conversation.count({ where: { id: member.welcomeConversationId } }), 0);
    const inbox = await request("/api/admin/welcome-replies", { token: admin.token });
    assert.equal(inbox.data.replies.length, 0);
  });

  await t.test("legacy welcomes upgrade once without changing read state, timestamps, replies or normal system events", async () => {
    const { upgradeWelcomeConversations, LOOPTALK_USER_ID } = require("../src/utils/welcomeConversation");
    const timestamp = new Date("2026-01-01T12:00:00Z");
    const legacy = await prisma.conversation.create({
      data: {
        name: "LoopTalk Welcome", kind: "WELCOME", lastMessageAt: timestamp,
        participants: { create: { userId: admin.user.id, lastReadAt: timestamp } },
        messages: { create: [
          { senderId: admin.user.id, messageType: "SYSTEM", content: "Legacy welcome", createdAt: timestamp },
          { senderId: admin.user.id, messageType: "TEXT", content: "Existing feedback" },
        ] },
      },
      include: { messages: true, participants: true },
    });
    const normalConversation = await prisma.conversation.create({ data: {
      participants: { create: { userId: admin.user.id } },
    } });
    const normalEvent = await prisma.message.create({
      data: {
        conversationId: normalConversation.id,
        senderId: admin.user.id,
        messageType: "SYSTEM",
        content: "Unrelated system event",
      },
    });
    await upgradeWelcomeConversations(prisma);
    await upgradeWelcomeConversations(prisma);
    const upgraded = await prisma.conversation.findUnique({
      where: { id: legacy.id }, include: { messages: true, participants: true },
    });
    assert.equal(upgraded.name, "LoopTalk");
    assert.deepEqual(upgraded.lastMessageAt, legacy.lastMessageAt);
    assert.deepEqual(upgraded.participants, legacy.participants);
    const initial = upgraded.messages.find((message) => message.id === legacy.messages[0].id);
    assert.equal(initial.senderId, LOOPTALK_USER_ID);
    assert.equal(initial.messageType, "TEXT");
    assert.equal(initial.content, "Legacy welcome");
    assert.deepEqual(initial.createdAt, timestamp);
    assert.deepEqual(upgraded.messages.find((message) => message.id === legacy.messages[1].id), legacy.messages[1]);
    assert.deepEqual(await prisma.message.findUnique({ where: { id: normalEvent.id } }), normalEvent);
    assert.equal(await prisma.user.count({ where: { status: "SYSTEM" } }), 1);
  });

  await t.test("public map uses genuine recorded topology at 100 users and bounds large snapshots", async (t) => {
    let now = Date.now() + 61_000;
    t.mock.method(Date, "now", () => now);
    const current = await prisma.user.count({ where: { status: { not: "SYSTEM" } } });
    let previousId = admin.user.id;
    let created = 0;
    const growTo = async (target) => {
      const needed = target - current - created;
      for (let offset = 0; offset < needed; offset += 100) {
        const users = Array.from({ length: Math.min(100, needed - offset) }, (_, index) => {
          const id = `private-map-user-${created + offset + index}`;
          return { id, username: id, displayName: "Private map fixture" };
        });
        await prisma.user.createMany({ data: users });
        const invitations = users.map((user) => {
          const result = {
            inviterId: previousId, acceptedById: user.id, status: "ACCEPTED",
            code: `map-${user.id}`, expiresAt: new Date(), acceptedAt: new Date(),
          };
          previousId = user.id;
          return result;
        });
        await prisma.invitation.createMany({ data: invitations });
      }
      created += needed;
    };
    await growTo(100);
    let result = await request("/api/invitations/map");
    assert.equal(result.status, 200);
    assert.equal(result.data.mode, "live");
    assert.equal(result.data.totalUsers, 100);
    assert.equal(result.data.nodes.length, 100);
    assert.ok(result.data.nodes.some((node) => node.parentId !== null));
    assert.equal(result.data.limited, false);
    assert.ok(result.data.historicalMissingLinks >= 0);
    await growTo(2100);
    now += 61_000;
    result = await request("/api/invitations/map");
    assert.equal(result.status, 200);
    assert.equal(result.data.totalUsers, 2100);
    assert.equal(result.data.nodes.length, 2000);
    assert.equal(result.data.limited, true);
    assert.ok(Buffer.byteLength(JSON.stringify(result.data)) < 100_000);
    assert.doesNotMatch(JSON.stringify(result.data), /private-map-user|Private map fixture|@example.com/);
  });
});
