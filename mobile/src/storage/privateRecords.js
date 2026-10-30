import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { encodeStoredRecord, decodeStoredRecord } from "../utils/ownerSession";

const directory = new Directory(Paths.document, "private-messages");
const recordFile = (key) => new File(directory, encodeURIComponent(key));
const updateQueues = new Map();

export const getItem = async (key) => {
  const file = recordFile(key);
  const value = file.exists ? await file.text() : await AsyncStorage.getItem(key);
  return decodeStoredRecord(key, value);
};

export const setItem = async (key, value) => {
  const encoded = encodeStoredRecord(key, value);
  const target = recordFile(key);
  const alreadyStoredInFile = target.exists;
  let temporary;
  try {
    directory.create({ idempotent: true, intermediates: true });
    temporary = new File(directory, `.write-${randomUUID()}`);
    temporary.write(encoded);
    await temporary.move(target, { overwrite: true });
  } catch (error) {
    if (alreadyStoredInFile) throw error;
    try {
      await AsyncStorage.setItem(key, encoded);
      console.warn("Private file storage is unavailable; using local key-value storage:", error);
    } catch (fallbackError) {
      console.error("Unable to persist a local record to either storage backend:", error, fallbackError);
      throw fallbackError;
    }
  } finally {
    if (temporary?.exists && temporary.name.startsWith(".write-")) {
      try {
        temporary.delete();
      } catch (error) {
        console.warn("Unable to remove a temporary private record file:", error);
      }
    }
  }
  if (target.exists) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn("Unable to remove the legacy local record copy:", error);
    }
  }
};

export const removeItem = async (key) => {
  const file = recordFile(key);
  if (file.exists) file.delete();
  await AsyncStorage.removeItem(key);
};

export const getAllKeys = async () => [...new Set([
  ...(await AsyncStorage.getAllKeys()),
  ...(directory.exists ? directory.list()
    .filter((file) => !file.name.startsWith(".write-"))
    .map((file) => decodeURIComponent(file.name)) : []),
])];

export const multiGet = (keys) => Promise.all(keys.map(async (key) => [key, await getItem(key)]));

export const migrateOwnerRecords = async (userId) => {
  const entries = [];
  for (const key of (await getAllKeys()).filter((name) => name.split(":").includes(userId))) {
    const file = recordFile(key);
    const raw = file.exists ? await file.text() : await AsyncStorage.getItem(key);
    if (raw === null) continue;
    const value = file.exists || raw.startsWith('{"version":1,"nonce":')
      ? decodeStoredRecord(key, raw)
      : raw;
    if (!file.exists) {
      await setItem(key, value);
      if (recordFile(key).exists) await AsyncStorage.removeItem(key);
    }
    entries.push([key, value]);
  }
  return entries;
};

export const updateItem = (key, update) => {
  const previous = updateQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const value = update(await getItem(key));
    if (value === null) await removeItem(key);
    else await setItem(key, value);
    return value;
  });
  updateQueues.set(key, next);
  const clearQueue = () => {
    if (updateQueues.get(key) === next) updateQueues.delete(key);
  };
  next.then(clearQueue, clearQueue);
  return next;
};
