import { privateTransaction } from "../storage/privateRecords";
import { encodeBase64, decodeBase64 } from "./messageEncryption";
import {
  isOwnerAccount, requireOwnerSession, encryptLocalValue, decryptLocalValue,
  getOwnerGeneration, assertOwnerGeneration,
} from "./ownerSession";

const urls = new Map();
const mediaKey = (userId, id) => `${userId}:${id}`;
export const clearPrivateMediaUrls = (userId) => {
  for (const [key, url] of urls) {
    if (!userId || key.startsWith(`${userId}:`)) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
};
export const readUploadBytes = async (uri) => {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to read attachment (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
};
export const savePrivateMedia = async (userId, id, bytes, mimeType) => {
  const generation = getOwnerGeneration();
  const key = mediaKey(userId, id);
  const safeType = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime)|audio\/(mp4|mpeg|wav|webm|ogg)|application\/pdf|text\/(plain|csv))$/.test(mimeType)
    ? mimeType : "application/octet-stream";
  const blob = new Blob([bytes], { type: safeType });
  const stored = isOwnerAccount(userId) ? encryptLocalValue(userId, `media:${id}`, {
    bytes: encodeBase64(bytes), mimeType: safeType,
  }) : blob;
  await privateTransaction("media", "readwrite", (store) => store.put(stored, key));
  if (isOwnerAccount(userId)) assertOwnerGeneration(generation);
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
};
export const privateMediaUrl = async (userId, id) => {
  const generation = getOwnerGeneration();
  const key = mediaKey(userId, id);
  if (isOwnerAccount(userId)) requireOwnerSession(userId);
  if (urls.has(key)) return urls.get(key);
  const stored = await privateTransaction("media", "readonly", (store) => store.get(key));
  if (isOwnerAccount(userId)) assertOwnerGeneration(generation);
  if (!stored) throw new Error("Local attachment is missing");
  const value = isOwnerAccount(userId) ? decryptLocalValue(userId, `media:${id}`, stored) : null;
  const blob = value ? new Blob([decodeBase64(value.bytes)], { type: value.mimeType }) : stored;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
};
export const readPrivateMedia = async (userId, id) => {
  const stored = await privateTransaction("media", "readonly", (store) => store.get(mediaKey(userId, id)));
  if (!stored) throw new Error("Local attachment is missing");
  if (isOwnerAccount(userId)) return decryptLocalValue(userId, `media:${id}`, stored).bytes;
  return encodeBase64(new Uint8Array(await stored.arrayBuffer()));
};
export const removePrivateMedia = async (userId, id) => {
  const key = mediaKey(userId, id);
  await privateTransaction("media", "readwrite", (store) => store.delete(key));
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  urls.delete(key);
};
export const migratePrivateMedia = async (userId) => {
  const keys = await privateTransaction("media", "readonly", (store) => store.getAllKeys());
  for (const key of keys.filter((value) => typeof value === "string" && value.startsWith(`${userId}:`))) {
    const stored = await privateTransaction("media", "readonly", (store) => store.get(key));
    const id = key.slice(userId.length + 1);
    if (stored?.version === 1) {
      decryptLocalValue(userId, `media:${id}`, stored);
    } else if (stored && typeof stored.arrayBuffer === "function") {
      await savePrivateMedia(userId, id, new Uint8Array(await stored.arrayBuffer()), stored.type);
    } else {
      throw new Error("Invalid legacy private attachment");
    }
  }
};
export const openPrivateAttachment = async (message) => {
  const anchor = document.createElement("a");
  anchor.href = message.mediaUrl;
  anchor.download = message.fileName || "attachment";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
};
export const createCipherUpload = async (bytes) => ({
  file: new Blob([bytes], { type: "application/octet-stream" }),
  dispose() {},
});
export const encodeAttachment = async (uri) => {
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(uri) ? decodeBase64(uri) : await readUploadBytes(uri);
  if (bytes.length > 100 * 1024 * 1024) throw new Error("Attachment exceeds the 100 MB limit");
  return encodeBase64(bytes);
};
