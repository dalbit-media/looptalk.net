const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const express = require("express");
const jwt = require("jsonwebtoken");

test("opaque ephemeral encrypted relay with isolated SQLite database", { timeout: 180000 }, async (t) => {
  t.mock.method(console, "error", () => {});
  // Keep generated client and SQLite strictly inside the project, never the
  // development database or the shared generated Prisma client.
  const directory = path.join(__dirname, `.secure-relay-${crypto.randomUUID()}`);
  await fs.mkdir(directory);
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  await fs.mkdir(process.env.UPLOAD_DIR);
  const schemaPath = path.join(directory, "schema.prisma");
  const schema = await fs.readFile(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  await fs.writeFile(schemaPath, schema.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "./client"\n  engineType = "binary"'));
  const env = { ...process.env, DATABASE_URL: `file:${path.join(directory, "relay.db")}` };
  let prisma;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (prisma) await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });
  for (const args of [["generate"], ["db", "push", "--skip-generate"]]) {
    const result = spawnSync(process.execPath, [
      require.resolve("prisma/build/index.js"), ...args, "--schema", schemaPath,
    ], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  }
  const { PrismaClient } = require(path.join(directory, "client"));
  prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  require.cache[require.resolve("../src/db/client")] = { exports: prisma };
  process.env.JWT_SECRET = "isolated-encrypted-relay-test-secret";
  const pushes = [];
  const pushModule = require("../src/utils/pushNotifications");
  const realSecurePush = pushModule.sendSecureMessagePush;
  t.mock.method(pushModule, "sendSecureMessagePush", async (data) => pushes.push(data));
  const events = [];
  const traffic = [];
  t.mock.method(require("../src/utils/invitationTraffic").invitationTraffic, "record",
    (...sample) => traffic.push(sample));
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.set("io", { to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }) });
  app.use("/api/secure", require("../src/routes/secure"));
  app.use("/api/messages", require("../src/routes/messages"));
  app.use("/api/conversations", require("../src/routes/conversations"));
  app.use("/api/reports", require("../src/routes/reports"));
  app.use("/api/users", require("../src/routes/users"));
  app.use("/api/auth", require("../src/routes/auth"));
  app.use("/api/admin", require("../src/routes/admin"));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const users = {};
  for (const id of ["alice", "bob", "carol", "outsider"]) {
    users[id] = await prisma.user.create({ data: { id, username: id, displayName: id } });
  }
  const tokens = Object.fromEntries(Object.keys(users).map((id) => [id, jwt.sign({ id }, process.env.JWT_SECRET)]));
  const request = async (url, { user = "alice", method = "GET", body, form, binary } = {}) => {
    const response = await fetch(origin + url, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(form ? { body: form } : body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status, headers: response.headers,
      data: binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json(),
    };
  };
  const device = (user) => ({ user, deviceId: crypto.randomUUID(), publicKey: crypto.randomBytes(32).toString("base64") });
  const alice = device("alice"), alice2 = device("alice"), bob = device("bob"), carol = device("carol"), outsider = device("outsider");
  const register = (d, publicKey = d.publicKey, user = d.user) =>
    request("/api/secure/devices", { user, method: "POST", body: { deviceId: d.deviceId, publicKey } });
  for (const d of [alice, alice2, bob, outsider]) assert.equal((await register(d)).status, 200);
  const direct = await prisma.conversation.create({
    data: { id: "direct", participants: { create: [{ userId: "alice" }, { userId: "bob" }] } },
  });
  const group = await prisma.conversation.create({
    data: { id: "group", isGroupChat: true, participants: { create: [
      { userId: "alice", role: "OWNER" }, { userId: "bob" }, { userId: "carol" },
    ] } },
  });
  const envelope = (d) => ({
    deviceId: d.deviceId, publicKey: d.publicKey,
    nonce: crypto.randomBytes(24).toString("base64"), wrappedKey: crypto.randomBytes(48).toString("base64"),
  });
  const make = (devices = [alice2, bob], overrides = {}) => ({
    id: crypto.randomUUID(), messageId: crypto.randomUUID(), kind: "message",
    senderDeviceId: alice.deviceId, recipients: devices.map(envelope), ...overrides,
  });
  const payload = Buffer.concat([crypto.randomBytes(24), crypto.randomBytes(128)]);
  const send = async (data, { conversationId = direct.id, bytes = payload, user = "alice" } = {}) => {
    const form = new FormData();
    form.append("metadata", JSON.stringify(data));
    form.append("payload", new Blob([bytes], { type: "application/octet-stream" }), "ciphertext.bin");
    return request(`/api/secure/conversations/${conversationId}/messages`, { user, method: "POST", form });
  };
  const inbox = (d) => request(`/api/secure/inbox?deviceId=${d.deviceId}`, { user: d.user });
  const fetchPayload = (id, d, user = d.user) =>
    request(`/api/secure/messages/${id}/payload?deviceId=${d.deviceId}`, { user, binary: true });
  const ack = (id, d, user = d.user) =>
    request(`/api/secure/messages/${id}/ack`, { user, method: "POST", body: { deviceId: d.deviceId } });

  await t.test("auth first; canonical immutable public keys and device ownership", async () => {
    assert.equal((await request("/api/secure/devices", { user: null })).status, 401);
    assert.equal((await register(alice)).status, 200);
    assert.equal((await register(alice, bob.publicKey)).data.code, "DEVICE_IMMUTABLE");
    assert.equal((await register(alice, alice.publicKey, "bob")).status, 409);
    assert.equal((await register({ ...alice, deviceId: crypto.randomUUID() }, "not-base64")).status, 400);
    assert.equal((await register({ ...alice, deviceId: crypto.randomUUID() }, Buffer.alloc(32).toString("base64"))).status, 400);
    assert.equal((await inbox({ ...alice, user: "bob" })).status, 403);
    assert.equal((await request("/api/secure/devices")).data.devices.length, 2);
  });
  await t.test("roster requires all participants and excludes no own devices", async () => {
    const roster = await request(`/api/secure/conversations/${direct.id}/devices`);
    assert.deepEqual(roster.data.participantIds, ["alice", "bob"]);
    assert.equal(roster.data.devices.length, 3);
    assert.equal((await request(`/api/secure/conversations/${direct.id}/devices`, { user: "outsider" })).status, 403);
    assert.equal((await request(`/api/secure/conversations/${group.id}/devices`)).data.code, "MISSING_RECIPIENT_DEVICES");
    assert.equal((await send(make(), { conversationId: group.id })).data.code, "MISSING_RECIPIENT_DEVICES");
    assert.equal((await register(carol)).status, 200);
    for (const recipients of [[bob], [alice, alice2, bob], [alice2, bob, outsider]]) {
      assert.equal((await send(make(recipients))).data.code, "RECIPIENTS_CHANGED");
    }
    const wrongKey = make();
    wrongKey.recipients[0].publicKey = outsider.publicKey;
    assert.equal((await send(wrongKey)).status, 409);
    const duplicate = make();
    duplicate.recipients.push(duplicate.recipients[0]);
    assert.equal((await send(duplicate)).status, 400);
    assert.equal((await send(make(), { bytes: Buffer.alloc(39) })).data.code, "INVALID_PAYLOAD");
  });
  let first;
  await t.test("opaque delivery, sender exclusion, bounded metadata-only inbox and hints", async () => {
    assert.deepEqual(traffic, [], "Rejected uploads must not publish traffic");
    first = make();
    assert.equal((await send(first)).status, 201);
    assert.equal(await prisma.message.count(), 0);
    assert.deepEqual(Buffer.from((await prisma.securePayload.findUnique({ where: { dispatchId: first.id } })).ciphertext), payload);
    assert.equal((await inbox(alice)).data.length, 0);
    const pending = (await inbox(bob)).data;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].senderPublicKey, alice.publicKey);
    assert.equal(pending[0].sender.displayName, "alice");
    await prisma.user.update({ where: { id: "alice" }, data: { publicDisplayName: "Public Alice" } });
    assert.deepEqual((await inbox(bob)).data[0].sender,
      { id: "alice", username: "alice", displayName: "Public Alice" });
    await prisma.user.update({ where: { id: "alice" }, data: { publicDisplayName: null } });
    assert.equal(pending[0].nonce, first.recipients.find((r) => r.deviceId === bob.deviceId).nonce);
    for (const field of ["ciphertext", "content", "mediaUrl", "digest", "recipients"]) assert.equal(field in pending[0], false);
    const downloaded = await fetchPayload(first.id, bob);
    assert.equal(downloaded.headers.get("cache-control"), "no-store");
    assert.deepEqual(downloaded.data, payload);
    assert.deepEqual(traffic, [["alice", "out", payload.length], ["bob", "in", payload.length]]);
    const head = await fetch(`${origin}/api/secure/messages/${first.id}/payload?deviceId=${bob.deviceId}`, {
      method: "HEAD", headers: { Authorization: `Bearer ${tokens.bob}` },
    });
    assert.equal(head.status, 200);
    assert.equal(traffic.length, 2, "HEAD requests do not transfer payload bytes");
    assert.equal(events.length, 2);
    assert.deepEqual(new Set(events.map((e) => e.room)), new Set(["user_alice", "user_bob"]));
    assert.ok(events.every((e) => e.event === "secure_message_available" && Object.keys(e.payload).sort().join(",") === "conversationId,id"));
    assert.equal(pushes.length, 1);
    assert.deepEqual(pushes[0].recipientIds, ["bob"]);
    const receipt = await prisma.secureDispatch.findUnique({ where: { id: first.id } });
    assert.equal("content" in receipt, false);
    assert.equal("ciphertext" in receipt, false);
  });
  await t.test("only addressed owned devices can fetch or remove pending envelopes", async () => {
    const trafficCount = traffic.length;
    assert.equal((await fetchPayload(first.id, bob, "outsider")).status, 403);
    assert.equal((await fetchPayload(first.id, outsider)).status, 404);
    assert.equal((await fetchPayload(first.id, alice)).status, 404);
    assert.equal((await ack(first.id, bob, "outsider")).status, 403);
    assert.equal((await ack(first.id, outsider)).status, 200);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatchId: first.id } }), 2);
    assert.equal((await ack(first.id, bob)).status, 200);
    assert.equal((await fetchPayload(first.id, bob)).status, 404);
    assert.equal((await inbox(bob)).data.length, 0);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: first.id } }), 1);
    assert.equal((await ack(first.id, bob)).status, 200);
    assert.equal((await ack(first.id, alice2)).status, 200);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: first.id } }), 0);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatchId: first.id } }), 0);
    assert.equal(await prisma.secureDispatch.count({ where: { id: first.id } }), 1);
    assert.equal(traffic.length, trafficCount, "Rejected downloads and ACKs must not publish traffic");
  });
  await t.test("idempotent receipts survive ACK and roster changes without requeue", async () => {
    const trafficCount = traffic.length;
    const newBob = device("bob");
    await register(newBob);
    const replay = await send({ ...first, recipients: [...first.recipients].reverse() });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.duplicate, true);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: first.id } }), 0);
    assert.equal((await send(first, { bytes: crypto.randomBytes(payload.length) })).data.code, "DISPATCH_CONFLICT");
    assert.equal((await send(make([alice2, bob], { messageId: first.messageId }))).data.code, "RECIPIENTS_CHANGED");
    assert.equal((await send(make([alice2, bob, newBob], { messageId: first.messageId }))).data.code, "MESSAGE_EXISTS");
    assert.equal((await send(make())).data.code, "RECIPIENTS_CHANGED");
    bob.extra = newBob;
    assert.equal(traffic.length, trafficCount, "Dispatch retries must not publish duplicate sends");
  });
  await t.test("edit/delete require original author; reactions require current membership", async () => {
    const recipients = [alice2, bob, bob.extra];
    for (const kind of ["edit", "delete", "reaction"]) {
      assert.equal((await send(make(recipients, { kind, messageId: first.messageId }))).status, 201);
    }
    for (const kind of ["edit", "delete"]) {
      const operation = make([alice, alice2, bob.extra], { senderDeviceId: bob.deviceId, kind, messageId: first.messageId });
      assert.equal((await send(operation, { user: "bob" })).data.code, "OPERATION_NOT_AUTHORIZED");
    }
    const reaction = make([alice, alice2, bob.extra], { senderDeviceId: bob.deviceId, kind: "reaction", messageId: first.messageId });
    assert.equal((await send(reaction, { user: "bob" })).status, 201);
    assert.equal((await send(make(recipients, { kind: "edit" }))).data.code, "MESSAGE_NOT_FOUND");
    assert.equal((await send(make(recipients, { kind: "invalid" }))).status, 400);
    assert.equal((await send(make(recipients, { content: "plaintext is prohibited" }))).status, 400);
    assert.equal((await send(make(recipients), { user: "outsider" })).status, 403);
  });
  await t.test("group removal prunes deliveries transactionally and prevents future fetch", async () => {
    const data = make([alice2, bob, bob.extra, carol]);
    assert.equal((await send(data, { conversationId: group.id })).status, 201);
    assert.equal((await fetchPayload(data.id, carol)).status, 200);
    const removed = await request(`/api/conversations/${group.id}/members/carol`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal((await fetchPayload(data.id, carol)).status, 404);
    assert.equal((await inbox(carol)).data.some((e) => e.id === data.id), false);
    for (const d of [alice2, bob, bob.extra]) assert.equal((await ack(data.id, d)).status, 200);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
  });
  await t.test("direct blocks and unsupported WELCOME deny encrypted delivery", async () => {
    await prisma.block.create({ data: { userId: "bob", blockedUserId: "alice" } });
    assert.equal((await request(`/api/secure/conversations/${direct.id}/devices`)).data.code, "DIRECT_BLOCKED");
    assert.equal((await send(make([alice2, bob, bob.extra]))).status, 403);
    const pending = await prisma.secureEnvelope.findFirst({ where: { deviceId: bob.deviceId } });
    assert.equal((await fetchPayload(pending.dispatchId, bob)).status, 403);
    assert.equal((await ack(pending.dispatchId, bob)).status, 403);
    await prisma.block.deleteMany();
    await prisma.conversation.create({ data: { id: "welcome", kind: "WELCOME", participants: { create: { userId: "alice" } } } });
    assert.equal((await request("/api/secure/conversations/welcome/devices")).data.code, "UNSUPPORTED_CONVERSATION");
  });
  await t.test("self-only group with no recipients retains only content-free receipt", async () => {
    await prisma.conversation.create({ data: { id: "self", isGroupChat: true, participants: { create: { userId: "outsider" } } } });
    const data = make([], { senderDeviceId: outsider.deviceId });
    assert.equal((await send(data, { conversationId: "self", user: "outsider" })).status, 201);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
    assert.equal((await send(data, { conversationId: "self", user: "outsider" })).data.duplicate, true);
  });
  await t.test("all private legacy writes return 426 before plaintext/media persistence, history remains", async () => {
    const legacy = await prisma.message.create({
      data: { conversationId: direct.id, senderId: "alice", content: "legacy migration history" },
    });
    const paths = [
      ["POST", `/api/messages/${direct.id}/text`],
      ["POST", `/api/messages/${direct.id}/media`],
      ["POST", `/api/messages/${direct.id}/${legacy.id}/react`],
      ["PUT", `/api/messages/${direct.id}/${legacy.id}`],
      ["DELETE", `/api/messages/${direct.id}/${legacy.id}`],
    ];
    for (const [method, url] of paths) {
      const result = await request(url, { method, body: { content: "private plaintext", emoji: "x" } });
      assert.equal(result.status, 426);
      assert.equal(result.data.code, "E2EE_REQUIRED");
    }
    const form = new FormData();
    form.append("messageType", "FILE");
    form.append("file", new Blob(["private plaintext attachment"], { type: "application/octet-stream" }), "private.txt");
    assert.equal((await request(`/api/messages/${direct.id}/media`, { method: "POST", form })).status, 426);
    assert.deepEqual(await fs.readdir(process.env.UPLOAD_DIR), []);
    assert.equal((await request(`/api/messages/${direct.id}`)).data[0].content, "legacy migration history");
    assert.equal(await prisma.message.count(), 1);
    assert.equal(await prisma.messageReaction.count(), 0);
    const welcomeReply = await request("/api/messages/welcome/text", { method: "POST", body: { content: "support feedback" } });
    assert.equal(welcomeReply.status, 201);
  });
  await t.test("simultaneous final ACKs do not lose cleanup or erase unrelated delivery", async () => {
    const data = make([alice2, bob, bob.extra]);
    assert.equal((await send(data)).status, 201);
    const responses = await Promise.all([ack(data.id, alice2), ack(data.id, bob), ack(data.id, bob.extra)]);
    assert.deepEqual(responses.map((r) => r.status), [200, 200, 200]);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatchId: data.id } }), 0);
  });
  await t.test("concurrent identical sends are accepted once and never duplicate deliveries", async () => {
    const data = make([alice2, bob, bob.extra]);
    const results = await Promise.all([send(data), send(data)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(await prisma.secureDispatch.count({ where: { id: data.id } }), 1);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatchId: data.id } }), 3);
  });
  await t.test("encrypted reports resolve durable metadata, never content or ciphertext", async () => {
    const result = await request("/api/reports", {
      user: "bob", method: "POST", body: { messageId: first.messageId, category: "SPAM" },
    });
    assert.equal(result.status, 201);
    const record = await prisma.report.findUnique({ where: { id: result.data.id } });
    assert.equal(record.messageId, null);
    assert.equal(record.reportedUserId, "alice");
    const snapshot = JSON.parse(record.contentSnapshot);
    assert.equal(snapshot.encrypted, true);
    assert.equal(snapshot.messageId, first.messageId);
    assert.deepEqual(Object.keys(snapshot).sort(), ["conversationId", "createdAt", "encrypted", "id", "kind", "messageId", "senderId"]);
    assert.equal((await request("/api/reports", {
      user: "outsider", method: "POST", body: { messageId: first.messageId, category: "SPAM" },
    })).status, 404);
    assert.equal((await request("/api/reports", {
      user: "bob", method: "POST", body: { messageId: first.messageId, category: "SPAM" },
    })).status, 409);
    const other = await send(make([alice2, bob, bob.extra]));
    assert.equal((await request("/api/reports", {
      user: "bob", method: "POST", body: { messageId: other.data.id, category: "SPAM" },
    })).status, 201);
  });
  await t.test("leaving prunes the final revoked device and immediately removes payload", async () => {
    await prisma.conversation.create({
      data: { id: "leave", isGroupChat: true, participants: { create: [{ userId: "alice", role: "OWNER" }, { userId: "carol" }] } },
    });
    const data = make([alice2, carol]);
    assert.equal((await send(data, { conversationId: "leave" })).status, 201);
    assert.equal((await ack(data.id, alice2)).status, 200);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 1);
    assert.equal((await request("/api/conversations/leave/leave", { user: "carol", method: "POST" })).status, 200);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatchId: data.id } }), 0);
    assert.equal(await prisma.secureDispatch.count({ where: { id: data.id } }), 1);
  });
  await t.test("blocking discards pending direct ciphertext, never group deliveries or replay receipts", async () => {
    const groupData = make([alice2, bob, bob.extra]);
    assert.equal((await send(groupData, { conversationId: group.id })).status, 201);
    const data = make([alice2, bob, bob.extra]);
    assert.equal((await send(data)).status, 201);
    assert.equal((await request("/api/users/alice/block", { user: "bob", method: "POST" })).status, 200);
    assert.equal(await prisma.secureEnvelope.count({ where: { dispatch: { conversationId: direct.id } } }), 0);
    assert.equal(await prisma.securePayload.count({ where: { dispatch: { conversationId: direct.id } } }), 0);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: groupData.id } }), 1);
    assert.equal(await prisma.secureDispatch.count({ where: { id: data.id } }), 1);
    assert.equal((await request("/api/users/alice/unblock", { user: "bob", method: "POST" })).status, 200);
    assert.equal((await send(data)).data.duplicate, true);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
  });
  await t.test("inbox is capped at 50 and ACK progression reveals subsequent envelopes", async () => {
    // Empty the group deliveries from earlier cases, then seed fully opaque
    // dispatches whose other devices have already acknowledged.
    for (const item of (await inbox(bob)).data) await ack(item.id, bob);
    await prisma.$transaction(Array.from({ length: 55 }, () => {
      const id = crypto.randomUUID();
      const r = envelope(bob);
      return prisma.secureDispatch.create({
        data: {
          id, messageId: id, kind: "message", conversationId: direct.id, digest: crypto.randomBytes(32).toString("hex"),
          senderId: "alice", senderDeviceId: alice.deviceId, senderPublicKey: alice.publicKey,
          payload: { create: { ciphertext: payload } },
          envelopes: { create: { deviceId: bob.deviceId, nonce: r.nonce, wrappedKey: r.wrappedKey } },
        },
      });
    }));
    const page = (await inbox(bob)).data;
    assert.equal(page.length, 50);
    for (const item of page) assert.equal((await ack(item.id, bob)).status, 200);
    assert.equal((await inbox(bob)).data.length, 5);
    const lateDevice = device("bob");
    assert.equal((await register(lateDevice)).status, 200);
    assert.equal((await inbox(lateDevice)).data.length, 0);
  });
  await t.test("device registration has a bounded immutable roster", async () => {
    for (let index = 0; index < 31; index += 1) {
      await prisma.secureDevice.create({
        data: { deviceId: crypto.randomUUID(), userId: "outsider", publicKey: crypto.randomBytes(32).toString("base64") },
      });
    }
    assert.equal((await register(device("outsider"))).data.code, "DEVICE_LIMIT");
    assert.equal((await register(outsider)).status, 200);
  });
  await t.test("account deletion revokes device envelopes and removes final pending ciphertext", async () => {
    await prisma.conversation.create({
      data: { id: "account-delete", isGroupChat: true, participants: { create: [{ userId: "alice", role: "OWNER" }, { userId: "carol" }] } },
    });
    const data = make([alice2, carol]);
    assert.equal((await send(data, { conversationId: "account-delete" })).status, 201);
    assert.equal((await ack(data.id, alice2)).status, 200);
    assert.equal((await request("/api/auth/account", {
      user: "carol", method: "DELETE", body: { confirmation: "DELETE" },
    })).status, 200);
    assert.equal(await prisma.securePayload.count({ where: { dispatchId: data.id } }), 0);
    assert.equal(await prisma.secureDevice.count({ where: { userId: "carol" } }), 0);
    assert.equal(await prisma.secureDispatch.count({ where: { id: data.id } }), 1);
  });
  await t.test("operational overview counts encrypted relay without reading or exposing ciphertext", async () => {
    const result = await request("/api/admin/public-overview");
    assert.equal(result.status, 200);
    assert.equal(result.data.privacy.endToEndEncryptionEnabled, true);
    assert.equal(result.data.privacy.privateChatServerCanReadMessageContent, false);
    assert.equal(result.data.privacy.legacyHistoryMayContainPlaintext, true);
    assert.equal(result.data.storage.encryptedPendingDeviceDeliveries, await prisma.secureEnvelope.count());
    assert.equal(result.data.storage.encryptedPendingPayloads, await prisma.securePayload.count());
    assert.ok(result.data.storage.encryptedPendingBytes > 0);
    assert.equal(result.data.counts.legacyMessages, await prisma.message.count());
    assert.equal(result.data.counts.encryptedMessageReceipts, await prisma.secureDispatch.count({ where: { kind: "message" } }));
    assert.equal(result.data.counts.messages, result.data.counts.legacyMessages + result.data.counts.encryptedMessageReceipts);
    assert.equal(result.data.storage.totalEstimatedMessagePayloadBytes,
      result.data.storage.legacyRetainedPayloadBytes + result.data.storage.encryptedPendingBytes);
    assert.equal(JSON.stringify(result.data).includes(payload.toString("base64")), false);
  });
  await t.test("real secure push construction contains generic text and routing hints only", async () => {
    const outgoing = [];
    const { Expo } = require("expo-server-sdk");
    t.mock.method(Expo.prototype, "sendPushNotificationsAsync", async (messages) => {
      outgoing.push(...messages);
      return [];
    });
    await prisma.deviceToken.create({
      data: { userId: "bob", token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", platform: "ios" },
    });
    await realSecurePush({ recipientIds: ["bob"], conversationId: direct.id, id: first.id });
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].title, "LoopTalk");
    assert.equal(outgoing[0].body, "Encrypted message");
    assert.deepEqual(outgoing[0].data, { type: "secure_message_available", conversationId: direct.id, id: first.id });
  });
  await t.test("inviter welcome opens an ordinary private CHAT with encrypted replies in both directions", async () => {
    for (const id of ["invite-issuer", "invite-recipient"]) {
      await prisma.user.create({ data: {
        id, username: id, displayName: "Owner-only name",
        authPublicKey: crypto.randomBytes(32).toString("base64"), encryptedVault: "{}",
      } });
      tokens[id] = jwt.sign({ id }, process.env.JWT_SECRET);
    }
    const issuer = device("invite-issuer"), recipient = device("invite-recipient");
    assert.equal((await register(issuer)).status, 200);
    assert.equal((await register(recipient)).status, 200);
    const { createInvitationWelcome } = require("../src/utils/welcomeConversation");
    const conversation = await prisma.$transaction((tx) =>
      createInvitationWelcome(tx, issuer.user, recipient.user));
    assert.equal(conversation.kind, "CHAT");
    const welcome = (await request(`/api/messages/${conversation.id}`, { user: recipient.user })).data[0];
    assert.equal(welcome.automaticWelcome, true);
    assert.equal(welcome.senderId, issuer.user);
    assert.equal((await request(`/api/messages/${conversation.id}`, { user: "outsider" })).status, 403);
    assert.equal((await request(`/api/messages/${conversation.id}/text`, {
      user: recipient.user, method: "POST", body: { content: "Plaintext must not bypass E2EE" },
    })).status, 426);
    for (const [sender, target] of [[recipient, issuer], [issuer, recipient]]) {
      const metadata = {
        id: crypto.randomUUID(), messageId: crypto.randomUUID(), kind: "message",
        senderDeviceId: sender.deviceId, recipients: [envelope(target)],
      };
      const response = await send(metadata, { conversationId: conversation.id, user: sender.user });
      assert.equal(response.status, 201, JSON.stringify(response.data));
      const pending = (await inbox(target)).data.find((item) => item.id === metadata.id);
      assert.equal(pending.senderId, sender.user);
      assert.equal(pending.conversationId, conversation.id);
      assert.deepEqual((await fetchPayload(metadata.id, target)).data, payload);
      assert.equal((await ack(metadata.id, target)).status, 200);
    }
    assert.equal(await prisma.message.count({ where: { conversationId: conversation.id } }), 1);
    assert.equal(await prisma.secureDispatch.count({ where: { conversationId: conversation.id } }), 2);
  });
});
