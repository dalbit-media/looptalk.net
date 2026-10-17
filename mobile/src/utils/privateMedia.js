import { Directory, File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { randomUUID } from "expo-crypto";
import { encodeBase64, decodeBase64 } from "./messageEncryption";
import {
  isOwnerAccount, requireOwnerSession, encryptLocalValue, decryptLocalValue,
  getOwnerGeneration, assertOwnerGeneration,
} from "./ownerSession";

const mediaDirectory = (userId) => new Directory(Paths.document, "private-media", encodeURIComponent(userId));
const extension = (mimeType) => ({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/webm": "webm",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
}[mimeType] || "bin");
const mediaFile = (userId, id, mimeType) =>
  new File(mediaDirectory(userId), `${encodeURIComponent(id)}.${extension(mimeType)}`);
const previewDirectory = (userId) => new Directory(Paths.cache, "private-preview", encodeURIComponent(userId));
const sealedFile = (userId, id) => new File(mediaDirectory(userId), `${encodeURIComponent(id)}.sealed`);
export const clearPrivateMediaUrls = (userId) => {
  const directory = previewDirectory(userId);
  if (directory.exists) {
    for (const file of directory.list()) {
      if (file instanceof File) file.delete();
    }
  }
};

export const readUploadBytes = async (uri) => {
  if (uri.startsWith("file:") || uri.startsWith("content:")) return new File(uri).bytes();
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to read attachment (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
};
export const savePrivateMedia = async (userId, id, bytes, mimeType) => {
  mediaDirectory(userId).create({ idempotent: true, intermediates: true });
  const privateAccount = isOwnerAccount(userId);
  const file = privateAccount ? sealedFile(userId, id) : mediaFile(userId, id, mimeType);
  const temporary = new File(mediaDirectory(userId), `.write-${randomUUID()}`);
  const generation = getOwnerGeneration();
  try {
    temporary.write(privateAccount ? JSON.stringify(encryptLocalValue(userId, `media:${id}`, {
      bytes: encodeBase64(bytes), mimeType,
    })) : bytes);
    await temporary.move(file, { overwrite: true });
    if (privateAccount) assertOwnerGeneration(generation);
  } finally {
    if (temporary.exists && temporary.name.startsWith(".write-")) temporary.delete();
  }
  return privateAccount ? privateMediaUrl(userId, id, mimeType) : file.uri;
};
export const privateMediaUrl = async (userId, id, mimeType) => {
  if (isOwnerAccount(userId)) {
    requireOwnerSession(userId);
    const generation = getOwnerGeneration();
    const stored = sealedFile(userId, id);
    if (!stored.exists) throw new Error("Local attachment is missing");
    const value = decryptLocalValue(userId, `media:${id}`, JSON.parse(await stored.text()));
    assertOwnerGeneration(generation);
    if (value.mimeType.startsWith("image/")) return `data:${value.mimeType};base64,${value.bytes}`;
    previewDirectory(userId).create({ idempotent: true, intermediates: true });
    const preview = new File(previewDirectory(userId), `${encodeURIComponent(id)}.${extension(value.mimeType)}`);
    preview.write(decodeBase64(value.bytes));
    return preview.uri;
  }
  const file = mediaFile(userId, id, mimeType);
  if (!file.exists) throw new Error("Local attachment is missing");
  return file.uri;
};
export const readPrivateMedia = async (userId, id, mimeType) => {
  if (isOwnerAccount(userId)) {
    const stored = sealedFile(userId, id);
    return decryptLocalValue(userId, `media:${id}`, JSON.parse(await stored.text())).bytes;
  }
  return encodeBase64(await mediaFile(userId, id, mimeType).bytes());
};
export const removePrivateMedia = async (userId, id, mimeType) => {
  if (isOwnerAccount(userId)) requireOwnerSession(userId);
  const file = isOwnerAccount(userId) ? sealedFile(userId, id) : mediaFile(userId, id, mimeType);
  if (file.exists) file.delete();
  const preview = new File(previewDirectory(userId), `${encodeURIComponent(id)}.${extension(mimeType)}`);
  if (preview.exists) preview.delete();
};
export const migratePrivateMedia = async (userId, records) => {
  const mimeTypes = new Map();
  for (const [, value] of records) {
    if (!value.startsWith("[")) continue;
    for (const message of JSON.parse(value)) {
      if (message.localMediaId) mimeTypes.set(message.localMediaId, message.mediaMimeType);
      if (message.localThumbnailId) mimeTypes.set(message.localThumbnailId, message.thumbnailMimeType);
    }
  }
  const directory = mediaDirectory(userId);
  if (!directory.exists) return;
  for (const file of directory.list()) {
    if (!(file instanceof File) || file.name.endsWith(".sealed")) continue;
    if (file.name.startsWith(".write-")) {
      file.delete();
      continue;
    }
    const separator = file.name.lastIndexOf(".");
    const id = decodeURIComponent(file.name.slice(0, separator));
    const mimeType = mimeTypes.get(id) || "application/octet-stream";
    await savePrivateMedia(userId, id, await file.bytes(), mimeType);
    file.delete();
  }
};
export const openPrivateAttachment = (message) =>
  shareAsync(message.mediaUrl, { mimeType: message.mediaMimeType || "application/octet-stream" });
export const createCipherUpload = async (bytes, id) => {
  const file = new File(Paths.cache, `encrypted-${id}.bin`);
  file.write(bytes);
  return {
    file: { uri: file.uri, name: "encrypted.bin", type: "application/octet-stream" },
    dispose: () => { if (file.exists) file.delete(); },
  };
};
export const encodeAttachment = async (uri) => {
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(uri) ? decodeBase64(uri) : await readUploadBytes(uri);
  if (bytes.length > 100 * 1024 * 1024) throw new Error("Attachment exceeds the 100 MB limit");
  return encodeBase64(bytes);
};
