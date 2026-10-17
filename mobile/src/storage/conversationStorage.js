import * as AsyncStorage from "./privateRecords";
import { readPrivateMedia } from "../utils/privateMedia";
import { isOwnerAccount, encryptLocalValue } from "../utils/ownerSession";

const STORAGE_PREFIX = "looptalk:conversation";
const OUTBOX_PREFIX = "looptalk:message-outbox";
const writeQueues = new Map();

const conversationKey = (userId, conversationId) =>
  `${STORAGE_PREFIX}:${userId}:${conversationId}`;
const outboxKey = (userId) => `${OUTBOX_PREFIX}:${userId}`;

const parseMessages = (value) => {
  if (!value) return [];
  try {
    const messages = JSON.parse(value);
    if (!Array.isArray(messages)) throw new Error("Local conversation data is not an array");
    return messages;
  } catch (error) {
    console.error("Invalid local conversation data:", error);
    throw error;
  }
};

export const readConversationMessagesBatch = async (userId, conversationIds = []) => {
  if (!userId || !conversationIds.length) return [];
  const keys = conversationIds.map((conversationId) => conversationKey(userId, conversationId));
  const entries = await AsyncStorage.multiGet(keys);
  return entries.map(([, value]) => parseMessages(value));
};

export const readConversationMessages = async (userId, conversationId) => {
  if (!userId || !conversationId) return [];
  return parseMessages(await AsyncStorage.getItem(conversationKey(userId, conversationId)));
};

export const updateConversationMessages = (userId, conversationId, update) => {
  const key = conversationKey(userId, conversationId);
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const value = await AsyncStorage.updateItem(key, (current) =>
      JSON.stringify(update(parseMessages(current)))
    );
    return parseMessages(value);
  });

  writeQueues.set(key, next);
  const clearQueue = () => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  };
  next.then(clearQueue, clearQueue);
  return next;
};

export const readMessageOutbox = async (userId) => {
  if (!userId) return [];
  return parseMessages(await AsyncStorage.getItem(outboxKey(userId)));
};

export const readLocalConversationLibrary = async (userId) => {
  if (!userId) throw new Error("A signed-in account is required to browse local data");
  const prefix = `${STORAGE_PREFIX}:${userId}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    typeof key === "string" && key.startsWith(prefix)
  );
  const [conversations, outbox] = await Promise.all([
    AsyncStorage.multiGet(keys),
    readMessageOutbox(userId),
  ]);
  return [
    ...conversations.flatMap(([key, value]) => parseMessages(value).map((message) => ({
      ...message, conversationId: key.slice(prefix.length),
    }))),
    ...outbox.filter((entry) => !entry.kind || entry.kind === "message").map((entry) => ({
      ...entry.secureBody,
      ...entry,
      messageType: entry.secureBody?.messageType || entry.messageType || "TEXT",
    })),
  ];
};

export const updateMessageOutbox = (userId, update) => {
  const key = outboxKey(userId);
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const value = await AsyncStorage.updateItem(key, (current) => {
      const updated = update(parseMessages(current));
      return updated.length ? JSON.stringify(updated) : null;
    });
    return parseMessages(value);
  });

  writeQueues.set(key, next);
  const clearQueue = () => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  };
  next.then(clearQueue, clearQueue);
  return next;
};

export const exportConversationArchive = async (userId) => {
  const prefix = `${STORAGE_PREFIX}:${userId}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(prefix)
  );
  const values = await AsyncStorage.multiGet(keys);

  const archive = {
    format: "looptalk-conversation-archive",
    version: 2,
    exportedAt: new Date().toISOString(),
    ownerId: userId,
    conversations: await Promise.all(values.map(async ([key, value]) => ({
      conversationId: key.slice(prefix.length),
      messages: await Promise.all(parseMessages(value).map(async (message) => {
        if (message.deletedAt) return message;
        return {
          ...message,
          ...(message.localMediaId ? {
            mediaUrl: null,
            attachment: {
              mimeType: message.mediaMimeType,
              bytes: await readPrivateMedia(userId, message.localMediaId, message.mediaMimeType),
            },
          } : {}),
          ...(message.localThumbnailId ? {
            thumbnailUrl: null,
            thumbnail: {
              mimeType: message.thumbnailMimeType,
              bytes: await readPrivateMedia(userId, message.localThumbnailId, message.thumbnailMimeType),
            },
          } : {}),
        };
      })),
    }))),
  };
  return isOwnerAccount(userId) ? {
    format: "looptalk-encrypted-archive", version: 1,
    payload: encryptLocalValue(userId, "archive", archive),
  } : archive;
};
