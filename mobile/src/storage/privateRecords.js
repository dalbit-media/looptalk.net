import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { encodeStoredRecord, decodeStoredRecord } from "../utils/ownerSession";

const directory = new Directory(Paths.document, "private-messages");
const recordFile = (key) => new File(directory, encodeURIComponent(key));

export const getItem = async (key) => {
  const file = recordFile(key);
  const value = file.exists ? await file.text() : await AsyncStorage.getItem(key);
  return decodeStoredRecord(key, value);
};

export const setItem = async (key, value) => {
  directory.create({ idempotent: true, intermediates: true });
  const temporary = new File(directory, `.write-${randomUUID()}`);
  try {
    temporary.write(encodeStoredRecord(key, value));
    await temporary.move(recordFile(key), { overwrite: true });
  } finally {
    if (temporary.exists && temporary.uri.includes("/.write-")) temporary.delete();
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
    if (raw.startsWith('{"version":1,"nonce":')) {
      entries.push([key, decodeStoredRecord(key, raw)]);
    } else {
      await setItem(key, raw);
      entries.push([key, raw]);
    }
    await AsyncStorage.removeItem(key);
  }
  return entries;
};

export const updateItem = async (key, update) => {
  const value = update(await getItem(key));
  if (value === null) await removeItem(key);
  else await setItem(key, value);
  return value;
};
