const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const prisma = require("../db/client");
const auth = require("../middleware/auth");
const { sendSecureMessagePush } = require("../utils/pushNotifications");
const { secureTransaction } = require("../utils/secureRelay");
const { invitationTraffic } = require("../utils/invitationTraffic");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["message", "edit", "delete", "reaction"]);
const SENDER = { id: true, publicUsername: true, publicDisplayName: true };
const { opaqueUser } = require("../utils/privateAccounts");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 140 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1024 * 1024, parts: 3 },
}).single("payload");

function fail(status, code, error) {
  throw Object.assign(new Error(error), { status, code });
}
function base64(value, length) {
  return typeof value === "string" && Buffer.from(value, "base64").length === length &&
    Buffer.from(value, "base64").toString("base64") === value;
}
function uuid(value) { return typeof value === "string" && UUID.test(value); }
function route(handler) {
  return async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      await handler(req, res);
    } catch (error) {
      console.error("secure_relay_request_failed", {
        requestId: req.requestId, userId: req.userId,
        status: error.status || 500, code: error.code || "INTERNAL_ERROR",
        // Never log request bodies, ciphertext, keys, or database error details.
      });
      res.status(error.status || 500).json({
        error: error.status ? error.message : "Secure relay request failed",
        code: error.status ? error.code : "INTERNAL_ERROR",
      });
    }
  };
}

async function ownDevice(db, deviceId, userId) {
  if (!uuid(deviceId)) fail(400, "INVALID_DEVICE", "A UUID deviceId is required");
  const device = await db.secureDevice.findUnique({ where: { deviceId } });
  if (!device || device.userId !== userId) fail(403, "DEVICE_NOT_OWNED", "Device is not registered to this user");
  return device;
}

async function membership(db, conversationId, userId) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId }, include: { participants: { include: { user: { select: { status: true } } } } },
  });
  if (!conversation?.participants.some((p) => p.userId === userId)) {
    fail(403, "NOT_PARTICIPANT", "Not a conversation participant");
  }
  if (conversation.kind !== "CHAT" || conversation.participants.some((p) => p.user.status === "SYSTEM")) {
    fail(400, "UNSUPPORTED_CONVERSATION", "This conversation does not support encrypted messages");
  }
  if (!conversation.isGroupChat && conversation.participants.length === 2) {
    const other = conversation.participants.find((p) => p.userId !== userId).userId;
    const blocked = await db.block.findFirst({
      where: { OR: [{ userId, blockedUserId: other }, { userId: other, blockedUserId: userId }] },
      select: { id: true },
    });
    if (blocked) fail(403, "DIRECT_BLOCKED", "Direct communication is unavailable");
  }
  return conversation.participants.map((p) => p.userId).sort();
}

async function roster(db, conversationId, userId) {
  const participantIds = await membership(db, conversationId, userId);
  const devices = await db.secureDevice.findMany({
    where: { userId: { in: participantIds } },
    select: { deviceId: true, userId: true, publicKey: true },
    orderBy: { deviceId: "asc" },
  });
  if (participantIds.some((id) => !devices.some((d) => d.userId === id))) {
    fail(409, "MISSING_RECIPIENT_DEVICES", "Every participant must register an encryption device");
  }
  return { devices, participantIds };
}

function metadata(req) {
  let data;
  try { data = JSON.parse(req.body.metadata); } catch { fail(400, "INVALID_METADATA", "Invalid encrypted message metadata"); }
  if (!data || !uuid(data.id) || !uuid(data.messageId) || !uuid(data.senderDeviceId) ||
      !KINDS.has(data.kind) || !Array.isArray(data.recipients) || data.recipients.length > 4096 ||
      Object.keys(data).some((key) => !["id", "messageId", "kind", "senderDeviceId", "recipients"].includes(key))) {
    fail(400, "INVALID_METADATA", "Invalid encrypted message metadata");
  }
  const ids = new Set();
  const recipients = data.recipients.map((r) => {
    if (!r || !uuid(r.deviceId) || !base64(r.publicKey, 32) || !base64(r.nonce, 24) ||
        !base64(r.wrappedKey, 48) || ids.has(r.deviceId) ||
        Object.keys(r).some((key) => !["deviceId", "publicKey", "nonce", "wrappedKey"].includes(key))) {
      fail(400, "INVALID_METADATA", "Invalid or duplicate recipient envelope");
    }
    ids.add(r.deviceId);
    return { deviceId: r.deviceId, publicKey: r.publicKey, nonce: r.nonce, wrappedKey: r.wrappedKey };
  }).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  if (!req.file || req.file.size < 40) fail(400, "INVALID_PAYLOAD", "Encrypted payload must include nonce and authentication tag");
  return { id: data.id, messageId: data.messageId, kind: data.kind, senderDeviceId: data.senderDeviceId, recipients };
}

router.use(auth);
router.post("/devices", route(async (req, res) => {
  const { deviceId, publicKey } = req.body || {};
  if (!uuid(deviceId) || !base64(publicKey, 32) || Buffer.from(publicKey, "base64").every((b) => b === 0)) {
    fail(400, "INVALID_DEVICE", "A UUID deviceId and 32-byte base64 publicKey are required");
  }
  const device = await secureTransaction(prisma, async (db) => {
    const existing = await db.secureDevice.findUnique({ where: { deviceId } });
    if (existing) {
      if (existing.userId !== req.userId || existing.publicKey !== publicKey) {
        fail(409, "DEVICE_IMMUTABLE", "Device identity and public key cannot be changed");
      }
      return existing;
    }
    if (await db.secureDevice.count({ where: { userId: req.userId } }) >= 32) {
      fail(409, "DEVICE_LIMIT", "At most 32 encryption devices can be registered per user");
    }
    return db.secureDevice.create({ data: { deviceId, publicKey, userId: req.userId } });
  });
  res.json({ deviceId: device.deviceId, userId: device.userId, publicKey: device.publicKey });
}));
router.get("/devices", route(async (req, res) => {
  res.json({ devices: await prisma.secureDevice.findMany({
    where: { userId: req.userId }, select: { deviceId: true, userId: true, publicKey: true }, orderBy: { deviceId: "asc" },
  }) });
}));
router.get("/conversations/:conversationId/devices", route(async (req, res) => {
  res.json(await secureTransaction(prisma, (db) => roster(db, req.params.conversationId, req.userId)));
}));

router.post("/conversations/:conversationId/messages", (req, res, next) => {
  upload(req, res, (error) => {
    if (!error) return next();
    console.error("secure_relay_upload_rejected", { requestId: req.requestId, code: error.code || "INVALID_UPLOAD" });
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: "Invalid encrypted payload upload", code: error.code || "INVALID_UPLOAD",
    });
  });
}, route(async (req, res) => {
  const data = metadata(req);
  const digest = crypto.createHash("sha256").update(JSON.stringify({
    ...data, conversationId: req.params.conversationId, senderId: req.userId,
  })).update(req.file.buffer).digest("hex");
  const result = await secureTransaction(prisma, async (db) => {
    const sender = await ownDevice(db, data.senderDeviceId, req.userId);
    await membership(db, req.params.conversationId, req.userId);
    const previous = await db.secureDispatch.findUnique({ where: { id: data.id } });
    if (previous) {
      if (previous.digest !== digest) fail(409, "DISPATCH_CONFLICT", "Dispatch id already used with different data");
      return { dispatch: previous, duplicate: true, recipientUserIds: [] };
    }
    const { devices } = await roster(db, req.params.conversationId, req.userId);
    const expected = devices.filter((d) => d.deviceId !== data.senderDeviceId);
    if (expected.length !== data.recipients.length || expected.some((d) =>
      !data.recipients.some((r) => r.deviceId === d.deviceId && r.publicKey === d.publicKey))) {
      fail(409, "RECIPIENTS_CHANGED", "Recipient device roster changed; refresh and encrypt again");
    }
    const target = await db.secureDispatch.findFirst({
      where: { conversationId: req.params.conversationId, messageId: data.messageId, kind: "message" },
    });
    if (data.kind === "message") {
      if (target) fail(409, "MESSAGE_EXISTS", "Logical message id already exists");
    } else {
      if (!target) fail(404, "MESSAGE_NOT_FOUND", "Logical message not found");
      if ((data.kind === "edit" || data.kind === "delete") && target.senderId !== req.userId) {
        fail(403, "OPERATION_NOT_AUTHORIZED", "Only the original sender can edit or delete a message");
      }
    }
    const dispatch = await db.secureDispatch.create({
      data: {
        id: data.id, digest, conversationId: req.params.conversationId, messageId: data.messageId,
        kind: data.kind, senderId: req.userId, senderDeviceId: sender.deviceId, senderPublicKey: sender.publicKey,
        ...(expected.length ? {
          payload: { create: { ciphertext: req.file.buffer } },
          envelopes: { create: data.recipients.map(({ deviceId, nonce, wrappedKey }) => ({ deviceId, nonce, wrappedKey })) },
        } : {}),
      },
    });
    await db.conversation.update({ where: { id: dispatch.conversationId }, data: { lastMessageAt: dispatch.createdAt } });
    return { dispatch, duplicate: false, recipientUserIds: [...new Set(expected.map((d) => d.userId))] };
  }, { timeout: 30000 });
  const { dispatch, duplicate, recipientUserIds } = result;
  if (!duplicate) {
    res.once("finish", () => {
      if (res.statusCode === 201) invitationTraffic.record(req.userId, "out", req.file.buffer.length);
    });
  }
  // Notifications are hints only. A failed notification must not undo a committed dispatch.
  if (!duplicate) {
    try {
      for (const id of recipientUserIds) {
        req.app.get("io")?.to(`user_${id}`).emit("secure_message_available", { id: dispatch.id, conversationId: dispatch.conversationId });
      }
      await sendSecureMessagePush({ recipientIds: recipientUserIds.filter((id) => id !== req.userId), conversationId: dispatch.conversationId, id: dispatch.id });
    } catch (error) {
      console.error("secure_relay_notification_failed", { dispatchId: dispatch.id, code: error.code || "NOTIFICATION_FAILED" });
    }
  }
  res.status(duplicate ? 200 : 201).json({
    id: dispatch.id, messageId: dispatch.messageId, conversationId: dispatch.conversationId,
    kind: dispatch.kind, senderId: dispatch.senderId, senderDeviceId: dispatch.senderDeviceId,
    senderPublicKey: dispatch.senderPublicKey,
    sender: opaqueUser(await prisma.user.findUnique({ where: { id: dispatch.senderId }, select: SENDER })),
    createdAt: dispatch.createdAt, duplicate,
  });
}));

router.get("/inbox", route(async (req, res) => {
  const envelopes = await secureTransaction(prisma, async (db) => {
    await ownDevice(db, req.query.deviceId, req.userId);
    return db.secureEnvelope.findMany({
      where: { deviceId: req.query.deviceId, dispatch: { conversation: { participants: { some: { userId: req.userId } } } } },
      include: { dispatch: true }, orderBy: [{ dispatch: { createdAt: "asc" } }, { dispatchId: "asc" }], take: 50,
    });
  });
  const senders = await prisma.user.findMany({
    where: { id: { in: [...new Set(envelopes.map((e) => e.dispatch.senderId))] } }, select: SENDER,
  });
  const result = [];
  for (const { dispatch: d, nonce, wrappedKey } of envelopes) {
    // Blocks can change after enqueue. Do not deliver direct messages while blocked.
    try { await membership(prisma, d.conversationId, req.userId); } catch (error) {
      if (error.status === 403 || error.status === 400) continue;
      throw error;
    }
    result.push({
      id: d.id, messageId: d.messageId, kind: d.kind, conversationId: d.conversationId,
      senderId: d.senderId, senderDeviceId: d.senderDeviceId, senderPublicKey: d.senderPublicKey,
      sender: senders.some((s) => s.id === d.senderId) ? opaqueUser(senders.find((s) => s.id === d.senderId)) : null,
      createdAt: d.createdAt, nonce, wrappedKey,
    });
  }
  res.json(result);
}));

router.get("/messages/:id/payload", route(async (req, res) => {
  const ciphertext = await secureTransaction(prisma, async (db) => {
    await ownDevice(db, req.query.deviceId, req.userId);
    const envelope = await db.secureEnvelope.findUnique({
      where: { dispatchId_deviceId: { dispatchId: req.params.id, deviceId: req.query.deviceId } },
      include: { dispatch: { include: { payload: true } } },
    });
    if (!envelope) fail(404, "ENVELOPE_NOT_FOUND", "Pending envelope not found");
    await membership(db, envelope.dispatch.conversationId, req.userId);
    if (!envelope.dispatch.payload) fail(404, "PAYLOAD_NOT_FOUND", "Pending payload not found");
    return envelope.dispatch.payload.ciphertext;
  });
  const payload = Buffer.from(ciphertext);
  res.once("finish", () => {
    if (req.method === "GET" && res.statusCode === 200) invitationTraffic.record(req.userId, "in", payload.length);
  });
  res.type("application/octet-stream").send(payload);
}));

router.post("/messages/:id/ack", route(async (req, res) => {
  await secureTransaction(prisma, async (db) => {
    await ownDevice(db, req.body?.deviceId, req.userId);
    const envelope = await db.secureEnvelope.findUnique({
      where: { dispatchId_deviceId: { dispatchId: req.params.id, deviceId: req.body.deviceId } },
      include: { dispatch: true },
    });
    // A repeated ACK is harmless; it cannot remove another device's delivery.
    if (!envelope) return;
    await membership(db, envelope.dispatch.conversationId, req.userId);
    await db.secureEnvelope.delete({
      where: { dispatchId_deviceId: { dispatchId: req.params.id, deviceId: req.body.deviceId } },
    });
    if (!await db.secureEnvelope.count({ where: { dispatchId: req.params.id } })) {
      await db.securePayload.deleteMany({ where: { dispatchId: req.params.id } });
    }
  });
  res.json({ success: true });
}));

module.exports = router;
