import * as records from "../storage/privateRecords";
import { readLocalConversationLibrary } from "../storage/conversationStorage";

export const DATA_TYPES = [
  { key: "text", icon: "document-text-outline", color: "#5C9EFF" },
  { key: "image", icon: "image-outline", color: "#76D7B7" },
  { key: "video", icon: "videocam-outline", color: "#B4A0FF" },
  { key: "audio", icon: "musical-notes-outline", color: "#F3B943" },
  { key: "file", icon: "folder-outline", color: "#F1957E" },
];
export const CLOUD_PROVIDERS = ["Microsoft OneDrive", "Google Drive", "Apple iCloud", "Dropbox"];

const messageCategory = (message) => {
  if (message.messageType === "TEXT") return "text";
  if (["IMAGE", "DRAWING"].includes(message.messageType)) return "image";
  if (message.messageType === "VIDEO") return "video";
  if (message.messageType === "VOICE") return "audio";
  if (message.messageType === "FILE") {
    if (message.mediaMimeType?.startsWith("image/")) return "image";
    if (message.mediaMimeType?.startsWith("video/")) return "video";
    if (message.mediaMimeType?.startsWith("audio/")) return "audio";
    return "file";
  }
  return null;
};

export const buildDataLibrary = (messages) => {
  const entries = new Map();
  for (const message of messages) {
    const category = messageCategory(message);
    if (!category) continue;
    const id = message.clientMessageId || message.id;
    if (!id || !message.conversationId) throw new Error("Invalid local data identifier");
    const key = JSON.stringify([message.conversationId, id]);
    if (!entries.has(key)) entries.set(key, { key, category, message });
  }
  return [...entries.values()]
    .filter(({ message }) => !message.deletedAt)
    .sort((a, b) => (Date.parse(b.message.createdAt) || 0) - (Date.parse(a.message.createdAt) || 0));
};

export const summarizeDataLibrary = (entries) => DATA_TYPES.map((type) => ({
  ...type,
  count: entries.filter((entry) => entry.category === type.key).length,
}));

export const normalizeDataTags = (input) => {
  const values = typeof input === "string" ? input.split(",") : input;
  if (!Array.isArray(values) || values.some((tag) => typeof tag !== "string")) {
    throw new Error("Invalid data tags");
  }
  const tags = [...new Map(values.map((tag) => {
    const value = tag.trim().replace(/^#+/, "");
    return [value.toLocaleLowerCase(), value];
  }).filter(([, tag]) => tag)).values()];
  if (tags.length > 10 || tags.some((tag) => tag.length > 32 || /[\r\n]/.test(tag))) {
    throw new Error("Use at most 10 tags, each up to 32 characters");
  }
  return tags;
};

const tagsKey = (userId) => {
  if (!userId) throw new Error("A signed-in account is required to manage data tags");
  return `looptalk:data-tags:${userId}`;
};
const parseTags = (value) => {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid saved data tags");
  return Object.fromEntries(Object.entries(parsed).map(([key, tags]) => [key, normalizeDataTags(tags)]));
};
export const loadDataLibrary = async (userId) => {
  const key = tagsKey(userId);
  const [messages, savedTags] = await Promise.all([
    readLocalConversationLibrary(userId),
    records.getItem(key),
  ]);
  return { entries: buildDataLibrary(messages), tags: parseTags(savedTags) };
};
export const saveDataTags = async (userId, entryKey, input) => {
  if (typeof entryKey !== "string" || !entryKey) throw new Error("Invalid data item");
  const tags = normalizeDataTags(input);
  await records.updateItem(tagsKey(userId), (current) => {
    const saved = parseTags(current);
    if (tags.length) saved[entryKey] = tags;
    else delete saved[entryKey];
    return Object.keys(saved).length ? JSON.stringify(saved) : null;
  });
  return tags;
};
export const filterDataLibrary = (entries, tags, category, query = "", selectedTag = "") => {
  const search = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    const itemTags = tags[entry.key] || [];
    if (selectedTag && !itemTags.includes(selectedTag)) return false;
    return !search || [entry.message.content, entry.message.fileName, ...itemTags]
      .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(search));
  });
};
