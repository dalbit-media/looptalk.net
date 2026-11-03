const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
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
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    Uint8Array, ArrayBuffer, console, navigator: {}, setInterval, clearInterval,
  }, { filename });
  return module.exports;
};
const crypto = load("utils/messageEncryption.js");
const random = (length) => new Uint8Array(randomBytes(length));
const identity = () => crypto.createDeviceIdentity(random, randomUUID());
const asDevice = (key, userId) => ({ deviceId: key.deviceId, publicKey: key.publicKey, userId });
const fixture = () => {
  const sender = identity();
  const recipient = identity();
  const otherDevice = identity();
  const payload = {
    version: 1, id: randomUUID(), messageId: randomUUID(), kind: "message",
    conversationId: "private-room", senderId: "alice", senderDeviceId: sender.deviceId,
    body: { messageType: "TEXT", content: "A private conversation stays private." },
  };
  const encrypted = crypto.encryptDelivery(payload, sender, [
    asDevice(sender, "alice"), asDevice(recipient, "bob"), asDevice(otherDevice, "bob"),
  ], random);
  const delivery = {
    ...payload, ...encrypted.recipients[0], senderPublicKey: sender.publicKey,
  };
  delete delivery.body;
  delete delivery.version;
  return { sender, recipient, otherDevice, payload, encrypted, delivery };
};

test("encrypts once for every recipient device without including sender device", () => {
  const { sender, recipient, otherDevice, payload, encrypted, delivery } = fixture();
  assert.equal(encrypted.recipients.length, 2);
  assert.ok(!encrypted.recipients.some((item) => item.deviceId === sender.deviceId));
  assert.ok(!Buffer.from(encrypted.bytes).includes(Buffer.from(payload.body.content)));
  assert.equal(crypto.decryptDelivery(delivery, encrypted.bytes, recipient).body.content, payload.body.content);
  const second = { ...delivery, ...encrypted.recipients[1] };
  assert.equal(crypto.decryptDelivery(second, encrypted.bytes, otherDevice).body.content, payload.body.content);
  assert.throws(() => crypto.decryptDelivery(delivery, encrypted.bytes, identity()), /authenticate/);
});

test("rejects ciphertext, envelope, sender key, and authenticated-routing tampering", () => {
  const { recipient, encrypted, delivery } = fixture();
  const corrupted = encrypted.bytes.slice();
  corrupted[30] ^= 1;
  assert.throws(() => crypto.decryptDelivery(delivery, corrupted, recipient), /authenticate/);
  const wrapped = crypto.decodeBase64(delivery.wrappedKey);
  wrapped[0] ^= 1;
  assert.throws(() => crypto.decryptDelivery({
    ...delivery, wrappedKey: crypto.encodeBase64(wrapped),
  }, encrypted.bytes, recipient), /authenticate/);
  assert.throws(() => crypto.decryptDelivery({
    ...delivery, senderPublicKey: identity().publicKey,
  }, encrypted.bytes, recipient), /authenticate/);
  for (const field of ["id", "messageId", "kind", "conversationId", "senderId", "senderDeviceId"]) {
    assert.throws(() => crypto.decryptDelivery({
      ...delivery, [field]: "substituted",
    }, encrypted.bytes, recipient), /routing/);
  }
  assert.throws(() => crypto.decryptDelivery(delivery, new Uint8Array(2), recipient));
});

test("device safety code is stable and changes with public key", () => {
  const key = identity().publicKey;
  assert.equal(crypto.deviceFingerprint(key).replaceAll(" ", "").length, 64);
  assert.equal(crypto.deviceFingerprint(key), crypto.deviceFingerprint(key));
  assert.notEqual(crypto.deviceFingerprint(key), crypto.deviceFingerprint(identity().publicKey));
});

const serviceFixture = ({ ownIdentity } = {}) => {
  const f = fixture();
  const values = new Map();
  const history = new Map();
  const conversationStorage = {
    readLocalConversationLibrary: async () => [...history.values()].flat(),
    readConversationMessages: async (_userId, id) => history.get(id) || [],
    updateConversationMessages: async (_userId, id, update) => { history.set(id, update(history.get(id) || [])); },
  };
  const events = [];
  let pending = true;
  const records = {
    __esModule: true,
    getItem: async (key) => values.get(key),
    setItem: async (key, value) => { values.set(key, value); events.push(["store", key]); },
    removeItem: async (key) => values.delete(key),
  };
  const api = {
    __esModule: true,
    registerDevice: async () => {},
    getRecipientDevices: async () => ({
      devices: [asDevice(f.sender, "alice"), asDevice(f.recipient, "bob")],
    }),
    getEncryptedInbox: async () => pending ? [f.delivery] : [],
    getEncryptedPayload: async () => f.encrypted.bytes,
    acknowledgeDelivery: async () => { events.push(["ack"]); pending = false; },
    sendEncryptedDelivery: async (...args) => { events.push(["post", ...args]); return { success: true }; },
  };
  const media = {
    savePrivateMedia: async (...args) => { events.push(["media", ...args]); return "local:attachment"; },
    privateMediaUrl: async () => "local:rehydrated",
    encodeAttachment: async () => crypto.encodeBase64(new Uint8Array([1, 2, 3])),
    clearPrivateMediaUrls() {},
  };
  const service = load("utils/secureMessaging.js", {
    "expo-crypto": { getRandomBytes: random, randomUUID },
    "../storage/deviceIdentity": { loadOrCreateIdentity: async (userId) => ownIdentity || (userId === "alice" ? f.sender : f.recipient) },
    "../storage/privateRecords": records,
    "../api/secureMessages": api,
    "./messageEncryption": crypto,
    "./privateMedia": media,
    "../config/limits": require("../src/config/limits"),
    "../storage/conversationStorage": conversationStorage,
  });
  return { ...f, service, records, values, events, api, media, history };
};

test("saves ciphertext and local copy before upload; network retries reuse identical ciphertext", async () => {
  const f = serviceFixture();
  let attempts = 0;
  const sent = [];
  f.api.sendEncryptedDelivery = async (_conversation, metadata, bytes) => {
    assert.ok(f.events.some(([kind]) => kind === "local"));
    assert.ok(f.values.has(`looptalk:secure-dispatch:alice:${metadata.id}`));
    sent.push({ metadata, bytes });
    if (++attempts === 1) throw new Error("network offline");
    return { success: true };
  };
  const options = {
    userId: "alice", token: "token", ...f.payload,
    persist: async () => f.events.push(["local"]),
  };
  await assert.rejects(f.service.sendSecureDelivery(options), /offline/);
  await f.service.sendSecureDelivery(options);
  assert.deepEqual(sent[0].bytes, sent[1].bytes);
  assert.deepEqual(sent[0].metadata, sent[1].metadata);
  assert.ok(f.values.has(`looptalk:secure-dispatch:alice:${options.id}`));
  await f.service.clearSecureDispatch("alice", options.id);
  assert.ok(!f.values.has(`looptalk:secure-dispatch:alice:${options.id}`));
});

test("own-device history exchange encrypts old text and attachments only for the requested own device", async () => {
  const f = serviceFixture();
  f.api.getOwnDevices = async () => ({ devices: [
    asDevice(f.sender, "alice"), asDevice(f.otherDevice, "alice"), asDevice(f.recipient, "bob"),
  ] });
  const requests = [];
  f.api.requestHistorySync = async (...args) => requests.push(args);
  f.history.set("old-room", [
    { id: randomUUID(), conversationId: "old-room", senderId: "bob", messageType: "TEXT",
      content: "Old history", createdAt: new Date().toISOString(), encrypted: true },
    { id: randomUUID(), conversationId: "old-room", senderId: "alice", messageType: "IMAGE",
      localMediaId: "photo", mediaMimeType: "image/png", createdAt: new Date().toISOString(), encrypted: true },
  ]);
  await f.service.shareDeviceHistory("alice", "token", { requesterDeviceId: f.otherDevice.deviceId }, () => true);
  assert.deepEqual(requests[0], [f.sender.deviceId, "token", f.otherDevice.deviceId]);
  const posts = f.events.filter(([event]) => event === "post");
  assert.equal(posts.length, 2);
  for (const [, conversation, metadata, ciphertext] of posts) {
    assert.equal(conversation, "personal-notes:alice");
    assert.equal(metadata.kind, "history");
    assert.equal(metadata.recipients.length, 1);
    assert.equal(metadata.recipients[0].deviceId, f.otherDevice.deviceId);
    const body = crypto.decryptDelivery({
      ...metadata, conversationId: conversation, senderId: "alice", senderPublicKey: f.sender.publicKey,
      ...metadata.recipients[0],
    }, ciphertext, f.otherDevice).body;
    assert.equal(body.message.conversationId, "old-room");
    if (body.body.messageType === "IMAGE") assert.equal(body.body.attachment.bytes, "AQID");
    else assert.equal(body.body.content, "Old history");
  }
  assert.equal([...f.values.keys()].some((key) => key.startsWith("looptalk:secure-dispatch:")), false);
});

test("history import stores missing items without duplicates or overwriting newer local copies", async () => {
  const f = serviceFixture();
  const message = { id: randomUUID(), conversationId: "old-room", senderId: "bob", createdAt: new Date().toISOString() };
  const delivery = { senderId: "alice", conversationId: "personal-notes:alice" };
  await f.service.storeDeviceHistory("alice", delivery, {
    message, body: { messageType: "TEXT", content: "Old text" },
  }, () => true);
  assert.equal(f.history.get("old-room")[0].content, "Old text");
  await f.service.storeDeviceHistory("alice", delivery, {
    message, body: { messageType: "TEXT", content: "Do not replace" },
  }, () => true);
  assert.equal(f.history.get("old-room").length, 1);
  assert.equal(f.history.get("old-room")[0].content, "Old text");
  await assert.rejects(f.service.storeDeviceHistory("alice", { ...delivery, senderId: "bob" }, {
    message, body: { messageType: "TEXT", content: "Cross-account" },
  }, () => true), /own devices/);
  await assert.rejects(f.service.storeDeviceHistory("alice", delivery, {
    message: { ...message, id: randomUUID() }, body: { messageType: "TEXT", content: "Cancelled" },
  }, () => false), /account changed/);
});

test("two own devices transfer old text and media through encrypted inbox storage and ACK cleanup", async () => {
  const first = serviceFixture();
  const second = serviceFixture({ ownIdentity: first.otherDevice });
  const queue = [];
  first.api.getOwnDevices = async () => ({ devices: [
    asDevice(first.sender, "alice"), asDevice(first.otherDevice, "alice"),
  ] });
  first.api.requestHistorySync = async () => {};
  const createdAt = new Date().toISOString();
  first.history.set("old-room", [
    { id: randomUUID(), conversationId: "old-room", senderId: "alice", messageType: "TEXT",
      content: "From another device", createdAt, encrypted: true },
    { id: randomUUID(), conversationId: "old-room", senderId: "bob", messageType: "IMAGE",
      localMediaId: "saved-photo", mediaMimeType: "image/png", createdAt, encrypted: true },
  ]);
  first.api.sendEncryptedDelivery = async (conversationId, metadata, bytes) => {
    queue.push({
      delivery: { ...metadata, conversationId, senderId: "alice", senderPublicKey: first.sender.publicKey,
        ...metadata.recipients[0] },
      bytes,
    });
  };
  second.api.getEncryptedInbox = async () => queue.map((item) => item.delivery);
  second.api.getEncryptedPayload = async (id) => queue.find((item) => item.delivery.id === id).bytes;
  second.api.acknowledgeDelivery = async (id) => {
    assert.ok(second.history.get("old-room")?.length, "Local history commits before ACK");
    queue.splice(queue.findIndex((item) => item.delivery.id === id), 1);
  };
  await first.service.shareDeviceHistory("alice", "token", {
    requesterDeviceId: first.otherDevice.deviceId, targetDeviceId: first.sender.deviceId,
  }, () => true);
  assert.equal(queue.length, 2);
  assert.ok(queue.every((item) => !Buffer.from(item.bytes).includes(Buffer.from("From another device"))));
  await second.service.syncSecureInbox("alice", "token",
    (delivery, body) => second.service.storeDeviceHistory("alice", delivery, body, () => true), () => true);
  assert.equal(queue.length, 0);
  assert.equal(second.history.get("old-room").length, 2);
  assert.equal(second.history.get("old-room")[0].content, "From another device");
  assert.equal(second.history.get("old-room")[1].senderId, "bob");
  assert.ok(second.history.get("old-room")[1].localMediaId);
  assert.deepEqual([...second.events.find(([event]) => event === "media")[3]], [1, 2, 3]);
});

test("history export continues past an unavailable attachment but explicitly reports the incomplete transfer", async () => {
  const f = serviceFixture();
  f.api.getOwnDevices = async () => ({ devices: [
    asDevice(f.sender, "alice"), asDevice(f.otherDevice, "alice"),
  ] });
  f.media.privateMediaUrl = async () => { throw new Error("Local attachment is missing"); };
  f.history.set("old-room", [
    { id: randomUUID(), conversationId: "old-room", senderId: "alice", messageType: "IMAGE", localMediaId: "missing" },
    { id: randomUUID(), conversationId: "old-room", senderId: "alice", messageType: "TEXT",
      content: "Still available", createdAt: new Date().toISOString() },
  ]);
  await assert.rejects(f.service.shareDeviceHistory("alice", "token", {
    requesterDeviceId: f.otherDevice.deviceId, targetDeviceId: f.sender.deviceId,
  }, () => true), /1 history items could not be synced/);
  assert.equal(f.events.filter(([event]) => event === "post").length, 1);
});

test("refuses to upload when local message persistence fails", async () => {
  const f = serviceFixture();
  await assert.rejects(f.service.sendSecureDelivery({
    userId: "alice", token: "token", ...f.payload,
    persist: async () => { throw new Error("disk full"); },
  }), /disk full/);
  assert.ok(!f.events.some(([kind]) => kind === "post"));
});

test("refreshes ciphertext only for an explicitly unaccepted roster change, once", async () => {
  const f = serviceFixture();
  const attempts = [];
  f.api.sendEncryptedDelivery = async (_conversation, metadata, bytes) => {
    attempts.push({ metadata, bytes });
    if (attempts.length === 1) {
      throw { response: { status: 409, data: { code: "RECIPIENTS_CHANGED" } } };
    }
  };
  await f.service.sendSecureDelivery({
    userId: "alice", token: "token", ...f.payload, persist: async () => {},
  });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].metadata.id, attempts[1].metadata.id);
  assert.notDeepEqual(attempts[0].bytes, attempts[1].bytes);
  const previous = attempts[1].bytes;
  f.api.sendEncryptedDelivery = async () => {
    throw { response: { status: 409, data: { code: "DISPATCH_CONFLICT" } } };
  };
  await assert.rejects(f.service.sendSecureDelivery({
    userId: "alice", token: "token", ...f.payload, persist: async () => {},
  }));
  const saved = JSON.parse(f.values.get(`looptalk:secure-dispatch:alice:${f.payload.id}`));
  assert.deepEqual(crypto.decodeBase64(saved.ciphertext), previous);
});

test("does not acknowledge until local receive and dedup-marker writes succeed", async () => {
  const f = serviceFixture();
  await assert.rejects(f.service.syncSecureInbox("bob", "token", async () => {
    throw new Error("disk full");
  }, () => true), /disk full/);
  assert.ok(!f.events.some(([kind]) => kind === "ack"));
  await f.service.syncSecureInbox("bob", "token", async () => {
    f.events.push(["message"]);
  }, () => true);
  const messageIndex = f.events.findIndex(([kind]) => kind === "message");
  const markerIndex = f.events.findIndex(([kind, key]) => kind === "store" && key.includes("secure-received"));
  const ackIndex = f.events.findIndex(([kind]) => kind === "ack");
  assert.ok(messageIndex >= 0 && messageIndex < markerIndex && markerIndex < ackIndex);
});

test("a failed dedup marker commit prevents ACK", async () => {
  const f = serviceFixture();
  const original = f.records.setItem;
  f.records.setItem = async (key, value) => {
    if (key.includes("secure-received")) throw new Error("quota exceeded");
    return original(key, value);
  };
  await assert.rejects(f.service.syncSecureInbox("bob", "token", async () => {}, () => true), /quota/);
  assert.ok(!f.events.some(([kind]) => kind === "ack"));
});

test("retries a failed ACK without receiving or decrypting the stored message twice", async () => {
  const f = serviceFixture();
  let received = 0;
  const ack = f.api.acknowledgeDelivery;
  f.api.acknowledgeDelivery = async () => { throw new Error("ACK network error"); };
  await assert.rejects(f.service.syncSecureInbox("bob", "token", async () => { received += 1; }, () => true), /ACK network/);
  f.api.acknowledgeDelivery = ack;
  f.api.getEncryptedPayload = async () => { throw new Error("must not download again"); };
  await f.service.syncSecureInbox("bob", "token", async () => { received += 1; }, () => true);
  assert.equal(received, 1);
  assert.equal(f.events.filter(([kind]) => kind === "ack").length, 1);
});

test("authentication failure and account switch never acknowledge a delivery", async () => {
  const f = serviceFixture();
  f.api.getEncryptedPayload = async () => new Uint8Array(30);
  await assert.rejects(f.service.syncSecureInbox("bob", "token", async () => {}, () => true), /authenticate/);
  assert.ok(!f.events.some(([kind]) => kind === "ack"));
  f.api.getEncryptedPayload = async () => f.encrypted.bytes;
  let active = true;
  await f.service.syncSecureInbox("bob", "token", async () => { active = false; }, () => active);
  assert.ok(!f.events.some(([kind]) => kind === "ack"));
  assert.ok(!f.values.has(`looptalk:secure-received:bob:${f.delivery.id}`));
});

test("pins sender keys and refuses changed keys", async () => {
  const f = serviceFixture();
  f.values.set(`looptalk:trusted-device:bob:${f.sender.deviceId}`, JSON.stringify({
    userId: "alice", publicKey: identity().publicKey,
  }));
  await assert.rejects(f.service.syncSecureInbox("bob", "token", async () => {}, () => true), /key changed/);
  assert.ok(!f.events.some(([kind]) => kind === "ack"));
});

test("materializes and rehydrates private attachments without accepting sender-supplied URLs", async () => {
  const f = serviceFixture();
  const body = {
    messageType: "FILE", fileName: "private.txt", mediaUrl: "https://untrusted.example/file",
    attachment: { bytes: crypto.encodeBase64(new Uint8Array([1, 2, 3])), mimeType: "text/plain" },
  };
  const message = await f.service.materializePrivateMessage("bob", "message", body);
  assert.equal(message.mediaUrl, "local:attachment");
  assert.equal(message.localMediaId, "message-media");
  assert.ok(!Object.hasOwn(message, "attachment"));
  const [hydrated] = await f.service.hydratePrivateMedia("bob", [message]);
  assert.equal(hydrated.mediaUrl, "local:rehydrated");
  const [deleted] = await f.service.hydratePrivateMedia("bob", [{
    ...message, deletedAt: "2026-01-01", mediaUrl: null,
  }]);
  assert.equal(deleted.mediaUrl, null);
  await assert.rejects(f.service.materializePrivateMessage("bob", "bad", {
    messageType: "FILE",
  }), /missing/);
});

test("an attachment write failure cannot produce a local message", async () => {
  const f = serviceFixture();
  f.media.savePrivateMedia = async () => { throw new Error("media disk full"); };
  await assert.rejects(f.service.materializePrivateMessage("bob", "message", {
    messageType: "IMAGE",
    attachment: { bytes: "AQID", mimeType: "image/png" },
  }), /media disk full/);
});

const storeFixture = () => {
  const f = serviceFixture();
  f.records.multiGet = async (keys) => Promise.all(keys.map(async (key) => [key, await f.records.getItem(key)]));
  f.records.updateItem = async (key, update) => {
    const value = update(await f.records.getItem(key));
    if (value === null) await f.records.removeItem(key);
    else await f.records.setItem(key, value);
    return value;
  };

  const storage = load("storage/conversationStorage.js", {
    "./privateRecords": f.records,
    "../utils/privateMedia": { readPrivateMedia: async () => "AQID" },
    "../utils/ownerSession": { isOwnerAccount: () => false },
  });
  const alerts = [];
  const api = {
    __esModule: true,
    getConversation: async () => ({ id: "private-room", kind: "CHAT" }),
    getMessages: async () => [],
    markConversationRead: async () => {},
    sendTextMessage: async () => { throw new Error("Plaintext private send must not run"); },
  };
  const { useMessageStore: store } = load("store/messageStore.js", {
    "../config/environment": { API_URL: "http://test.invalid" },
    "../api/messages": api,
    "./callStore": { useCallStore: { getState: () => ({ detachSocket() {} }) } },
    "./authStore": { useAuthStore: { getState: () => ({ user: { id: "alice", displayName: "Alice" } }) } },
    "../storage/conversationStorage": storage,
    "../utils/presenceLifecycle": { attachPresenceLifecycle() {}, isPresenceActive: () => true },
    "../utils/secureMessaging": f.service,
    "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
    "../i18n/i18n": { t: (key) => key },
    "../utils/privateMedia": { removePrivateMedia: async () => {} },
    "../utils/desktopNotifications": { notifyDesktopMessage() {} },
    "../utils/conversationOrder": load("utils/conversationOrder.js"),
    "expo-crypto": { randomUUID },
  });
  store.setState({
    activeUserId: "alice",
    conversations: [{ id: "private-room", kind: "CHAT", messages: [] }],
    currentConversation: { id: "private-room" },
  });
  return { ...f, store, storage, messageApi: api, alerts };
};

test("queue sync requires an online device and requests own-device history after draining the inbox", async () => {
  const f = storeFixture();
  await assert.rejects(f.store.getState().syncOwnDevices("token"), /Connect this device/);
  f.api.getEncryptedInbox = async () => [];
  const requests = [];
  f.api.requestHistorySync = async (...args) => requests.push(args);
  f.store.setState({ socket: { connected: true } });
  await f.store.getState().syncOwnDevices("token");
  assert.deepEqual(requests, [[f.sender.deviceId, "token"]]);
  f.api.requestHistorySync = async () => { throw new Error("Offline"); };
  await assert.rejects(f.store.getState().syncOwnDevices("token"), /Offline/);
});

const enqueueText = async (f, id = randomUUID()) => {
  const entry = {
    clientMessageId: id, conversationId: "private-room", content: "Private queued text",
    createdAt: new Date().toISOString(), status: "queued",
  };
  await f.storage.updateMessageOutbox("alice", (outbox) => [...outbox, entry]);
  return entry;
};

test("message store sends private text via crypto, leaves a durable local copy, and clears its outbox", async () => {
  const f = storeFixture();
  const entry = await enqueueText(f);
  await f.store.getState()._sendOutboxEntry(entry, "token");
  const [message] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(message.id, entry.clientMessageId);
  assert.equal(message.encrypted, true);
  assert.equal(message.content, entry.content);
  assert.equal(message.deliveryState, null);
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 0);
  assert.equal(f.events.filter(([kind]) => kind === "post").length, 1);
});

test("Personal Notes stays first on refresh, message receipt and conversation updates", async () => {
  const f = storeFixture();
  const notes = { id: "notes", kind: "NOTES", createdAt: "2020-01-01", messages: [] };
  const chat = { id: "private-room", kind: "CHAT", createdAt: "2026-01-01", messages: [] };
  f.messageApi.getConversations = async () => [chat, notes];
  await f.store.getState().loadConversations("token", "alice");
  assert.equal(f.store.getState().conversations[0].id, "notes");
  await f.store.getState().receiveMessage({
    id: randomUUID(), conversationId: chat.id, senderId: "alice",
    messageType: "TEXT", content: "Newer chat", createdAt: "2026-11-03",
  });
  assert.equal(f.store.getState().conversations[0].id, "notes");
  f.store.getState().upsertConversation({ ...chat, name: "Updated" });
  assert.equal(f.store.getState().conversations[0].id, "notes");
});

test("Personal Notes uses encrypted delivery with only the owner's devices", async () => {
  const f = storeFixture();
  f.store.setState({ conversations: [{ id: "private-room", kind: "NOTES" }] });
  f.api.getRecipientDevices = async () => ({ devices: [asDevice(f.sender, "alice")] });
  const entry = await enqueueText(f);
  await f.store.getState()._sendOutboxEntry(entry, "token");
  const [message] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(message.content, entry.content);
  assert.equal(message.encrypted, true);
  const post = f.events.find(([kind]) => kind === "post");
  assert.equal(post[2].recipients.length, 0);
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 0);
});

test("web drawing data URLs send as encrypted PNG attachments and retain a durable local drawing", async () => {
  const f = storeFixture();
  f.media.encodeAttachment = load("utils/privateMedia.web.js", {
    "../storage/privateRecords": {},
    "./messageEncryption": crypto,
    "../config/limits": require("../src/config/limits"),
    "./ownerSession": {},
  }).encodeAttachment;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  await f.store.getState().sendMediaMessage("private-room", {
    uri: `data:image/png;base64,${png}`, name: "drawing.png",
    mimeType: "image/png", messageType: "DRAWING",
  }, "token");
  const [message] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(message.messageType, "DRAWING");
  assert.equal(message.mediaUrl, "local:attachment");
  assert.equal(message.deliveryState, null);
  assert.equal(message.encrypted, true);
  const [, , metadata, bytes] = f.events.find(([kind]) => kind === "post");
  const payload = crypto.decryptDelivery({
    ...metadata, ...metadata.recipients[0], conversationId: "private-room",
    senderId: "alice", senderPublicKey: f.sender.publicKey,
  }, bytes, f.recipient);
  assert.equal(payload.body.messageType, "DRAWING");
  assert.equal(payload.body.attachment.mimeType, "image/png");
  assert.equal(payload.body.attachment.bytes, png);
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 0);
});

test("concurrent retries of the same dispatch share a single send", async () => {
  const f = storeFixture();
  const entry = await enqueueText(f);
  const a = f.store.getState()._sendOutboxEntry(entry, "token");
  const b = f.store.getState()._sendOutboxEntry(entry, "token");
  assert.equal(a, b);
  await Promise.all([a, b]);
  assert.equal(f.events.filter(([kind]) => kind === "post").length, 1);
});

test("legacy native pending IDs migrate to stable UUIDs without duplicating local messages", async () => {
  const f = storeFixture();
  const entry = await enqueueText(f, "msg_old-native-pending");
  await f.storage.updateConversationMessages("alice", "private-room", () => [{
    ...entry, id: `pending:${entry.clientMessageId}`, senderId: "alice", messageType: "TEXT",
  }]);
  await f.store.getState()._sendOutboxEntry(entry, "token");
  const messages = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(messages.length, 1);
  assert.match(messages[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(messages[0].encrypted, true);
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 0);
});

test("only explicit WELCOME conversations use the existing plaintext path", async () => {
  const f = storeFixture();
  f.store.setState({ conversations: [{ id: "private-room", kind: "WELCOME" }] });
  const entry = await enqueueText(f, "msg_existing-welcome-id");
  f.messageApi.sendTextMessage = async (_conversation, content, _token, _reply, clientMessageId) => ({
    id: "legacy-message", conversationId: "private-room", content, clientMessageId, senderId: "alice",
  });
  await f.store.getState()._sendOutboxEntry(entry, "token");
  assert.equal(f.events.filter(([kind]) => kind === "post").length, 0);
  const [message] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(message.id, "legacy-message");
  assert.equal(message.clientMessageId, entry.clientMessageId);
});

test("failed private media setup leaves a visible retryable local message, never a public upload", async () => {
  const f = storeFixture();
  f.api.getRecipientDevices = async () => {
    throw { message: "Recipient needs setup", response: { status: 409, data: { code: "DEVICES_REQUIRED" } } };
  };
  await assert.rejects(f.store.getState().sendMediaMessage("private-room", {
    uri: "local:fixture", messageType: "FILE", fileName: "private.txt", mimeType: "text/plain",
  }, "token"));
  const [message] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(message.messageType, "FILE");
  assert.equal(message.deliveryState, "failed");
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 1);
  assert.equal(f.alerts.length, 1);
  assert.ok(!f.events.some(([kind]) => kind === "post"));
});

test("media upload progress reaches encrypted transport and durable failures identify their existing message", async () => {
  const f = storeFixture();
  const onUploadProgress = () => {};
  const payload = { uri: "local:fixture", name: "clip.mp4", mimeType: "video/mp4", messageType: "VIDEO" };
  await f.store.getState().sendMediaMessage("private-room", payload, "token", { onUploadProgress });
  const post = f.events.find(([kind]) => kind === "post");
  assert.equal(post[5].onUploadProgress, onUploadProgress);
  f.api.getRecipientDevices = async () => { throw new Error("Recipient unavailable"); };
  await assert.rejects(f.store.getState().sendMediaMessage("private-room", payload, "token"), (error) => {
    assert.match(error.clientMessageId, /^[0-9a-f-]{36}$/);
    return true;
  });
  assert.equal((await f.storage.readMessageOutbox("alice")).length, 1);
});

test("switching accounts during crypto preparation cannot store one user's message in another account", async () => {
  const f = storeFixture();
  const entry = await enqueueText(f);
  f.api.getRecipientDevices = async () => {
    f.store.setState({ activeUserId: "bob", messages: [], conversations: [] });
    return { devices: [asDevice(f.sender, "alice"), asDevice(f.recipient, "bob")] };
  };
  await assert.rejects(f.store.getState()._sendOutboxEntry(entry, "token"), /active account changed/);
  assert.equal((await f.storage.readConversationMessages("bob", "private-room")).length, 0);
  assert.ok(!f.events.some(([kind]) => kind === "post"));
});

test("original delivery replay preserves later edits, reactions, and deletion", async () => {
  const f = storeFixture();
  const id = randomUUID();
  const message = {
    id, clientMessageId: id, conversationId: "private-room", senderId: "alice",
    messageType: "TEXT", content: "original", encrypted: true, createdAt: new Date().toISOString(),
  };
  await f.store.getState().receiveMessage(message);
  await f.store.getState()._receiveSecureDelivery({
    ...message, messageId: id, kind: "edit",
  }, { content: "edited", editedAt: "2026-10-16T00:00:00Z" });
  await f.store.getState()._receiveSecureDelivery({
    ...message, messageId: id, kind: "reaction",
  }, { emoji: "OK", action: "added", createdAt: "2026-10-16T00:00:01Z" });
  await f.store.getState().receiveMessage(message);
  let [stored] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(stored.content, "edited");
  assert.equal(stored.reactions.length, 1);
  await f.store.getState()._receiveSecureDelivery({
    ...message, messageId: id, kind: "delete",
  }, { deletedAt: "2026-10-16T00:00:02Z" });
  await f.store.getState().receiveMessage(message);
  [stored] = await f.storage.readConversationMessages("alice", "private-room");
  assert.equal(stored.content, null);
  assert.ok(stored.deletedAt);
});

test("legacy pagination uses the server cursor, not the oldest local encrypted message ID", async () => {
  const f = storeFixture();
  let cursor;
  f.messageApi.getMessages = async (_conversation, _token, options) => { cursor = options.before; return []; };
  f.store.setState({
    hasOlderMessages: true, legacyHistoryCursor: "legacy-cursor",
    messages: [{ id: randomUUID(), encrypted: true }],
  });
  await f.store.getState().loadOlderMessages("private-room", "token");
  assert.equal(cursor, "legacy-cursor");
});
