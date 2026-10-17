import AsyncStorage from "@react-native-async-storage/async-storage";
import { openPrivateDatabase } from "./privateRecords";
import { clearPrivateMediaUrls } from "../utils/privateMedia";
import { isAppStorageKey } from "./resetKeys";

export const clearClientStorage = async () => {
  const database = await openPrivateDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(["records", "media"], "readwrite", { durability: "strict" });
    transaction.objectStore("records").clear();
    transaction.objectStore("media").clear();
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error("Local reset transaction aborted"));
    transaction.onerror = () => reject(transaction.error);
  });
  clearPrivateMediaUrls();
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(isAppStorageKey));
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const owned = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(isAppStorageKey);
    for (const key of owned) storage.removeItem(key);
  }
};
