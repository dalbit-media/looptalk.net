import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Directory, Paths } from "expo-file-system";
import { getAllKeys } from "./privateRecords";
import { isAppStorageKey, legacyDeviceUsers } from "./resetKeys";

export const clearClientStorage = async (userId) => {
  const keys = await getAllKeys();
  const users = new Set([...legacyDeviceUsers(keys), userId].filter(Boolean));
  await Promise.all([
    SecureStore.deleteItemAsync("token"),
    SecureStore.deleteItemAsync("looptalk.owner-recovery.v1"),
    ...[...users].map((id) => SecureStore.deleteItemAsync(`looptalk.secure-device.${id}`)),
  ]);
  for (const [base, name] of [
    [Paths.document, "private-messages"],
    [Paths.document, "private-media"],
    [Paths.cache, "private-preview"],
  ]) {
    const directory = new Directory(base, name);
    if (directory.exists) directory.delete();
  }
  await AsyncStorage.multiRemove(keys.filter(isAppStorageKey));
};
