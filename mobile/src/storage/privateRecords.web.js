import AsyncStorage from "@react-native-async-storage/async-storage";
import { encodeStoredRecord, decodeStoredRecord } from "../utils/ownerSession";

let databasePromise;
export const openPrivateDatabase = () => {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("looptalk-private", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records");
        request.result.createObjectStore("media");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Private message storage is blocked by another tab"));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};

export const privateTransaction = async (storeName, mode, operation) => {
  const database = await openPrivateDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode, { durability: "strict" });
    const request = operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error || new Error("Private storage transaction aborted"));
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getItem = async (key) => {
  const stored = await privateTransaction("records", "readonly", (store) => store.get(key));
  return decodeStoredRecord(key, stored === undefined ? await AsyncStorage.getItem(key) : stored);
};
export const setItem = (key, value) =>
  privateTransaction("records", "readwrite", (store) => store.put(encodeStoredRecord(key, value), key));
export const removeItem = async (key) => {
  await privateTransaction("records", "readwrite", (store) => store.delete(key));
  await AsyncStorage.removeItem(key);
};
export const multiGet = (keys) => Promise.all(keys.map(async (key) => [key, await getItem(key)]));

export const updateItem = async (key, update) => {
  const fallback = await AsyncStorage.getItem(key);
  const database = await openPrivateDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("records", "readwrite", { durability: "strict" });
    const store = transaction.objectStore("records");
    let value;
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        value = update(decodeStoredRecord(key, request.result ?? fallback));
        if (value === null) store.delete(key);
        else store.put(encodeStoredRecord(key, value), key);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error || new Error("Local record update failed"));
    transaction.onerror = () => reject(transaction.error);
  });
};
export const getAllKeys = async () => [...new Set([
  ...(await AsyncStorage.getAllKeys()),
  ...(await privateTransaction("records", "readonly", (store) => store.getAllKeys())),
])];

export const migrateOwnerRecords = async (userId) => {
  const entries = [];
  for (const key of (await getAllKeys()).filter((name) => typeof name === "string" && name.split(":").includes(userId))) {
    const fallback = await AsyncStorage.getItem(key);
    const database = await openPrivateDatabase();
    const value = await new Promise((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite", { durability: "strict" });
      const store = transaction.objectStore("records");
      let plaintext;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          const raw = request.result ?? fallback;
          if (raw === null) return;
          if (typeof raw === "string" && raw.startsWith('{"version":1,"nonce":')) {
            plaintext = decodeStoredRecord(key, raw);
          } else {
            plaintext = typeof raw === "string" ? raw : JSON.stringify(raw);
            store.put(encodeStoredRecord(key, plaintext), key);
          }
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(plaintext);
      transaction.onabort = () => reject(transaction.error || new Error("Private record migration failed"));
      transaction.onerror = () => reject(transaction.error);
    });
    if (value !== undefined) entries.push([key, value]);
    await AsyncStorage.removeItem(key);
  }
  return entries;
};
