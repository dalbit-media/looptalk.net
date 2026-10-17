const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const express = require("express");
const { Server } = require("socket.io");
const { io: connectSocket } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const { createPresenceService } = require("../src/utils/presence");

const waitFor = (socket, event, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.off(event, listener);
    reject(new Error(`Timed out waiting for ${event}`));
  }, 5000);
  const listener = (data) => {
    if (!predicate(data)) return;
    clearTimeout(timer);
    socket.off(event, listener);
    resolve(data);
  };
  socket.on(event, listener);
});

test("foreground presence supports legacy and private accounts across multiple devices", async (t) => {
  const directory = path.join(__dirname, `.legacy-presence-${crypto.randomUUID()}`);
  await fs.mkdir(directory);
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.JWT_SECRET = "presence-test-secret-not-for-production";
  const prisma = require("../src/db/client");
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const clients = [];
  const pending = new Set();
  const errors = [];
  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
    await Promise.all([...pending]);
    await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
    assert.deepEqual(errors, []);
  });
  const setup = spawnSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate",
    "--schema", path.resolve(__dirname, "..", "prisma", "schema.prisma"),
  ], { env: process.env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.error?.message || setup.stderr || setup.stdout);

  const alice = await prisma.user.create({ data: { username: "alice", displayName: "Alice" } });
  const bob = await prisma.user.create({ data: { username: "bob", displayName: "Bob" } });
  await prisma.contact.create({
    data: { userId: bob.id, contactUserId: alice.id, groupName: "Family 1" },
  });
  await prisma.conversation.create({
    data: { participants: { create: [{ userId: alice.id }, { userId: bob.id }] } },
  });
  let clock = Date.UTC(2026, 9, 14);
  const presence = createPresenceService({ io, prisma, now: () => new Date(clock += 1000) });
  const track = (promise) => {
    pending.add(promise);
    promise.then(
      () => pending.delete(promise),
      (error) => { errors.push(error); pending.delete(promise); }
    );
  };
  io.use((socket, next) => {
    socket.userId = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET).id;
    next();
  });
  io.on("connection", (socket) => {
    socket.join(`user_${socket.userId}`);
    track(presence.connect(socket));
    socket.on("user_status", ({ status }) => track(presence.setActive(socket, status)));
    socket.on("disconnect", () => track(presence.disconnect(socket)));
  });
  app.use(express.json());
  app.set("io", io);
  app.use("/api/users", require("../src/routes/users"));
  app.use("/api/contacts", require("../src/routes/contacts"));
  app.use("/api/conversations", require("../src/routes/conversations"));
  app.use("/api/auth", require("../src/routes/auth"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  const connect = async (user, active = true) => {
    const client = connectSocket(origin, {
      auth: { token: tokenFor(user), presenceActive: active },
      transports: ["websocket"], autoConnect: false,
    });
    clients.push(client);
    const snapshot = waitFor(client, "presence_snapshot");
    client.connect();
    return { client, snapshot: await snapshot };
  };
  const bobDevice = await connect(bob);
  const first = await connect(alice);
  assert.deepEqual(new Set(first.snapshot.users.map((user) => user.userId)), new Set([alice.id, bob.id]));
  const second = await connect(alice, false);
  assert.ok(second.snapshot.users.some((user) => user.userId === alice.id));

  const changed = (status) => waitFor(bobDevice.client, "user_status_changed",
    (data) => data.userId === alice.id && data.status === status);
  let update = changed("offline");
  first.client.emit("user_status", { status: "offline" });
  const offline = await update;
  assert.ok(offline.lastActiveAt);
  assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).lastActiveAt.toISOString(), offline.lastActiveAt);

  update = changed("offline");
  second.client.emit("user_status", { status: "offline" });
  assert.equal((await update).lastActiveAt, offline.lastActiveAt, "Background devices must not advance last-active time");

  update = changed("online");
  second.client.emit("user_status", { status: "online" });
  const online = await update;
  assert.ok(online.lastActiveAt > offline.lastActiveAt);

  update = changed("online");
  first.client.disconnect();
  await update;
  update = changed("offline");
  second.client.disconnect();
  const finalOffline = await update;
  assert.ok(finalOffline.lastActiveAt >= online.lastActiveAt);

  const reconnected = await connect(alice, false);
  assert.ok(!reconnected.snapshot.users.some((user) => user.userId === alice.id),
    "An ACTIVE account and a connected background device are not online");
  assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).lastActiveAt.toISOString(), finalOffline.lastActiveAt);

  const privateUser = await prisma.user.create({
    data: { username: "private", displayName: "Private", authPublicKey: "private-presence-test-key" },
  });
  const privateChanged = (status) => waitFor(bobDevice.client, "user_status_changed",
    (data) => data.userId === privateUser.id && data.status === status);
  const withoutTimestamp = (entry) => {
    assert.equal(Object.hasOwn(entry, "lastActiveAt"), false);
  };
  update = privateChanged("online");
  const privateFirst = await connect(privateUser);
  withoutTimestamp(await update);
  assert.deepEqual(privateFirst.snapshot.users.find((entry) => entry.userId === privateUser.id),
    { userId: privateUser.id, status: "online" });
  const privateSecond = await connect(privateUser, false);
  assert.ok(privateSecond.snapshot.users.some((entry) => entry.userId === privateUser.id));
  update = privateChanged("offline");
  privateFirst.client.emit("user_status", { status: "offline" });
  withoutTimestamp(await update);
  update = privateChanged("online");
  privateSecond.client.emit("user_status", { status: "online" });
  withoutTimestamp(await update);
  update = privateChanged("online");
  privateFirst.client.disconnect();
  withoutTimestamp(await update);
  update = privateChanged("offline");
  privateSecond.client.disconnect();
  withoutTimestamp(await update);
  const privateReconnected = await connect(privateUser, false);
  assert.ok(!privateReconnected.snapshot.users.some((entry) => entry.userId === privateUser.id));
  assert.equal((await prisma.user.findUnique({ where: { id: privateUser.id } })).lastActiveAt, null);

  const request = async (url, user = bob) => {
    const response = await fetch(`${origin}${url}`, {
      headers: { Authorization: `Bearer ${tokenFor(user)}` },
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await request(`/api/users/${alice.id}`)).lastActiveAt, undefined);
  assert.equal((await request("/api/contacts"))["Family 1"][0].contactUser.lastActiveAt, undefined);
  const conversations = await request("/api/conversations");
  assert.equal(conversations[0].participants.find((participant) => participant.userId === alice.id).user.lastActiveAt,
    undefined);
  const currentUser = await request("/api/auth/me", alice);
  assert.equal((currentUser.user || currentUser).lastActiveAt, undefined);
});

test("snapshots omit migrated accounts' cached timestamps and exclude deleted accounts", async () => {
  const snapshots = [];
  const socket = {
    userId: "private", data: {}, handshake: { auth: {} }, connected: true,
    emit: (event, payload) => snapshots.push({ event, payload }),
  };
  const service = createPresenceService({
    io: {
      emit: () => {},
      in: () => ({ fetchSockets: async () => [socket] }),
      fetchSockets: async () => [
        socket,
        { data: { userId: "migrated", presenceActive: true, privateAccount: false,
          lastActiveAt: "2026-10-14T00:00:00Z" } },
        { data: { userId: "deleted", presenceActive: true } },
      ],
    },
    prisma: { user: {
      findUnique: async () => ({ authPublicKey: "key" }),
      findMany: async () => [
        { id: "private", authPublicKey: "key" }, { id: "migrated", authPublicKey: "key" },
      ],
    } },
  });
  await service.connect(socket);
  assert.deepEqual(snapshots, [{
    event: "presence_snapshot",
    payload: { users: [
      { userId: "private", status: "online" }, { userId: "migrated", status: "online" },
    ] },
  }]);
});

test("presence rejects invalid states and propagates persistence errors", async () => {
  const service = createPresenceService({
    io: { emit: () => assert.fail("Do not publish a successful presence update") },
    prisma: { user: {
      findUnique: async () => ({ authPublicKey: null }),
      updateMany: async () => { throw new Error("Database unavailable"); },
    } },
  });
  const socket = {
    userId: "alice", data: {}, handshake: { auth: {} }, connected: true,
  };
  await assert.rejects(service.setActive(socket, "ACTIVE"), /Invalid presence status/);
  await assert.rejects(service.connect(socket), /Database unavailable/);
});
