import AsyncStorage from "@react-native-async-storage/async-storage";

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
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    console.error("Invalid local conversation data:", error);
    return [];
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
    const current = parseMessages(await AsyncStorage.getItem(key));
    const updated = update(current);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  });

  writeQueues.set(key, next);
  next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
  return next;
};

export const readMessageOutbox = async (userId) => {
  if (!userId) return [];
  return parseMessages(await AsyncStorage.getItem(outboxKey(userId)));
};

export const updateMessageOutbox = (userId, update) => {
  const key = outboxKey(userId);
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const current = parseMessages(await AsyncStorage.getItem(key));
    const updated = update(current);
    if (updated.length) await AsyncStorage.setItem(key, JSON.stringify(updated));
    else await AsyncStorage.removeItem(key);
    return updated;
  });

  writeQueues.set(key, next);
  next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
  return next;
};

export const exportConversationArchive = async (userId) => {
  const prefix = `${STORAGE_PREFIX}:${userId}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(prefix)
  );
  const values = await AsyncStorage.multiGet(keys);

  return {
    format: "looptalk-conversation-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    ownerId: userId,
    conversations: values.map(([key, value]) => ({
      conversationId: key.slice(prefix.length),
      messages: parseMessages(value),
    })),
  };
};
