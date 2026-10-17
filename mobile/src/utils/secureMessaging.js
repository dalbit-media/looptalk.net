import { getRandomBytes, randomUUID } from "expo-crypto";
import { loadOrCreateIdentity } from "../storage/deviceIdentity";
import * as records from "../storage/privateRecords";
import * as api from "../api/secureMessages";
import {
  createDeviceIdentity, encryptDelivery, decryptDelivery, encodeBase64, decodeBase64, deviceFingerprint,
} from "./messageEncryption";
import { encodeAttachment, savePrivateMedia, privateMediaUrl, clearPrivateMediaUrls } from "./privateMedia";

const identities = new Map();
const registrations = new Map();
const inboxQueues = new Map();
const dispatchKey = (userId, id) => `looptalk:secure-dispatch:${userId}:${id}`;
const seenKey = (userId, id) => `looptalk:secure-received:${userId}:${id}`;
const MAX_PAYLOAD_BYTES = 140 * 1024 * 1024;

export const clearSecureSession = (userId) => {
  identities.delete(userId);
  for (const key of registrations.keys()) {
    if (key.startsWith(`${userId}:`)) registrations.delete(key);
  }
  clearPrivateMediaUrls(userId);
};

export const getSecureIdentity = async (userId) => {
  if (!identities.has(userId)) {
    const promise = (async () => {
      return loadOrCreateIdentity(userId, () => createDeviceIdentity(getRandomBytes, randomUUID()));
    })().catch((error) => {
      identities.delete(userId);
      throw error;
    });
    identities.set(userId, promise);
  }
  return identities.get(userId);
};

export const ensureSecureDevice = async (userId, token) => {
  const identity = await getSecureIdentity(userId);
  const registrationKey = `${userId}:${token}`;
  if (!registrations.has(registrationKey)) {
    registrations.set(registrationKey, api.registerDevice(identity, token).catch((error) => {
      registrations.delete(registrationKey);
      throw error;
    }));
  }
  await registrations.get(registrationKey);
  return identity;
};

const pinDevice = async (userId, device) => {
  const key = `looptalk:trusted-device:${userId}:${device.deviceId}`;
  const known = await records.getItem(key);
  const value = JSON.stringify({ userId: device.userId, publicKey: device.publicKey });
  if (known && known !== value) throw new Error("A device encryption key changed. Delivery was stopped.");
  if (!known) await records.setItem(key, value);
};

const performSecureSend = async ({ userId, token, conversationId, id, messageId, kind, body, persist, options, rosterRetry = false }) => {
  const identity = await ensureSecureDevice(userId, token);
  const key = dispatchKey(userId, id);
  let prepared = await records.getItem(key);
  if (!prepared) {
    const roster = await api.getRecipientDevices(conversationId, token);
    for (const device of roster.devices) await pinDevice(userId, device);
    const payload = {
      version: 1, id, messageId, kind, conversationId,
      senderId: userId, senderDeviceId: identity.deviceId, body,
    };
    const encrypted = encryptDelivery(payload, identity, roster.devices, getRandomBytes);
    if (encrypted.bytes.length > MAX_PAYLOAD_BYTES) throw new Error("The encrypted message exceeds the upload limit");
    prepared = JSON.stringify({
      metadata: { id, messageId, kind, senderDeviceId: identity.deviceId, recipients: encrypted.recipients },
      ciphertext: encodeBase64(encrypted.bytes),
    });
    await records.setItem(key, prepared);
  }
  await persist();
  const { metadata, ciphertext } = JSON.parse(prepared);
  try {
    // Retain ciphertext until the caller removes its durable outbox entry.
    return await api.sendEncryptedDelivery(conversationId, metadata, decodeBase64(ciphertext), token, options);
  } catch (error) {
    if (!rosterRetry && error.response?.status === 409 && error.response?.data?.code === "RECIPIENTS_CHANGED") {
      // This code guarantees the server has never accepted this dispatch ID.
      await records.removeItem(key);
      return performSecureSend({
        userId, token, conversationId, id, messageId, kind, body, persist, options, rosterRetry: true,
      });
    }
    throw error;
  }
};

export const sendSecureDelivery = (options) => {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`looptalk-send:${options.userId}:${options.id}`, () => performSecureSend(options));
  }
  return performSecureSend(options);
};

export const clearSecureDispatch = (userId, id) => records.removeItem(dispatchKey(userId, id));

export const getEncryptionSafetyCodes = async (userId, conversationId, token) => {
  await ensureSecureDevice(userId, token);
  const roster = await api.getRecipientDevices(conversationId, token);
  for (const device of roster.devices) await pinDevice(userId, device);
  return roster.devices.map((device) => ({
    ...device, fingerprint: deviceFingerprint(device.publicKey),
  }));
};

export const preparePrivateAttachment = async (media) => ({
  content: null,
  messageType: media.messageType,
  duration: media.duration ?? null,
  width: media.width ?? null,
  height: media.height ?? null,
  fileName: media.fileName || media.name || null,
  fileSize: media.fileSize ?? null,
  replyToId: media.replyToId || null,
  attachment: {
    bytes: await encodeAttachment(media.uri),
    mimeType: media.mimeType || "application/octet-stream",
  },
  ...(media.thumbnailUri ? {
    thumbnail: {
      bytes: await encodeAttachment(media.thumbnailUri),
      mimeType: media.thumbnailMimeType || "image/jpeg",
    },
  } : {}),
});

export const materializePrivateMessage = async (userId, messageId, body) => {
  if (!["TEXT", "IMAGE", "VIDEO", "VOICE", "DRAWING", "FILE"].includes(body.messageType)) {
    throw new Error("Invalid encrypted message type");
  }
  if (body.messageType === "TEXT" && typeof body.content !== "string") {
    throw new Error("Invalid encrypted text message");
  }
  if (body.content != null && (typeof body.content !== "string" || body.content.length > 100000)) {
    throw new Error("Invalid encrypted message content");
  }
  if (body.fileName != null && (typeof body.fileName !== "string" || body.fileName.length > 1024)) {
    throw new Error("Invalid encrypted attachment name");
  }
  for (const field of ["duration", "width", "height", "fileSize"]) {
    if (body[field] != null && (!Number.isFinite(body[field]) || body[field] < 0)) {
      throw new Error(`Invalid encrypted attachment ${field}`);
    }
  }
  if (body.messageType !== "TEXT" && !body.attachment) throw new Error("Encrypted attachment is missing");
  const { attachment, thumbnail } = body;
  const message = {
    messageType: body.messageType, content: body.content ?? null,
    fileName: body.fileName ?? null, fileSize: body.fileSize ?? null,
    duration: body.duration ?? null, width: body.width ?? null, height: body.height ?? null,
    replyToId: body.replyToId ?? null, replyTo: body.replyTo ?? null,
  };
  if (attachment) {
    if (typeof attachment.bytes !== "string" || typeof attachment.mimeType !== "string") {
      throw new Error("Invalid encrypted attachment");
    }
    message.localMediaId = `${messageId}-media`;
    message.mediaMimeType = attachment.mimeType;
    message.mediaUrl = await savePrivateMedia(userId, message.localMediaId, decodeBase64(attachment.bytes), attachment.mimeType);
  }
  if (thumbnail) {
    if (typeof thumbnail.bytes !== "string" || typeof thumbnail.mimeType !== "string") {
      throw new Error("Invalid encrypted thumbnail");
    }
    message.localThumbnailId = `${messageId}-thumbnail`;
    message.thumbnailMimeType = thumbnail.mimeType;
    message.thumbnailUrl = await savePrivateMedia(userId, message.localThumbnailId, decodeBase64(thumbnail.bytes), thumbnail.mimeType);
  }
  return message;
};

export const hydratePrivateMedia = async (userId, messages) => Promise.all(messages.map(async (message) => message.deletedAt ? message : ({
  ...message,
  ...(message.localMediaId ? { mediaUrl: await privateMediaUrl(userId, message.localMediaId, message.mediaMimeType) } : {}),
  ...(message.localThumbnailId ? { thumbnailUrl: await privateMediaUrl(userId, message.localThumbnailId, message.thumbnailMimeType) } : {}),
})));

export const syncSecureInbox = (userId, token, receive, isActive) => {
  if (inboxQueues.has(userId)) return inboxQueues.get(userId);
  const promise = (async () => {
    const identity = await ensureSecureDevice(userId, token);
    for (;;) {
      if (!isActive()) return;
      const deliveries = await api.getEncryptedInbox(identity.deviceId, token);
      if (!deliveries.length) return;
      for (const delivery of deliveries) {
        if (!isActive()) return;
        const received = seenKey(userId, delivery.id);
        if (!(await records.getItem(received))) {
          await pinDevice(userId, {
            deviceId: delivery.senderDeviceId, userId: delivery.senderId, publicKey: delivery.senderPublicKey,
          });
          const bytes = await api.getEncryptedPayload(delivery.id, identity.deviceId, token);
          const payload = decryptDelivery(delivery, bytes, identity);
          if (!isActive()) return;
          await receive(delivery, payload.body);
          if (!isActive()) return;
          await records.setItem(received, "stored");
        }
        // Never acknowledge before attachments, message/operation, and dedup marker commit locally.
        await api.acknowledgeDelivery(delivery.id, identity.deviceId, token);
      }
    }
  })().finally(() => inboxQueues.delete(userId));
  inboxQueues.set(userId, promise);
  return promise;
};
