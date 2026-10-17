import { openPrivateDatabase, updateItem } from "./privateRecords";
import { isOwnerAccount } from "../utils/ownerSession";

export const loadOrCreateIdentity = async (userId, create) => {
  if (isOwnerAccount(userId)) {
    const value = await updateItem(`looptalk:secure-identity:${userId}`, (stored) =>
      stored || JSON.stringify(create())
    );
    return JSON.parse(value);
  }
  const database = await openPrivateDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("records", "readwrite", { durability: "strict" });
    const store = transaction.objectStore("records");
    const key = `looptalk:secure-identity:${userId}`;
    let identity;
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        identity = request.result || create();
        if (!request.result) store.put(identity, key);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };

    transaction.oncomplete = () => resolve(identity);
    transaction.onabort = () => reject(transaction.error || new Error("Device key storage failed"));
    transaction.onerror = () => reject(transaction.error);
  });
};

export const migrateDeviceIdentity = async () => {};
