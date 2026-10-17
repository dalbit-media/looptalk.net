import * as SecureStore from "expo-secure-store";
import { updateItem } from "./privateRecords";
import { isOwnerAccount } from "../utils/ownerSession";

export const loadOrCreateIdentity = async (userId, create) => {
  if (isOwnerAccount(userId)) {
    const value = await updateItem(`looptalk:secure-identity:${userId}`, (stored) =>
      stored || JSON.stringify(create())
    );
    return JSON.parse(value);
  }
  const key = `looptalk.secure-device.${userId}`;
  const stored = await SecureStore.getItemAsync(key);
  if (stored) return JSON.parse(stored);
  const identity = create();
  await SecureStore.setItemAsync(key, JSON.stringify(identity));
  return identity;
};

export const migrateDeviceIdentity = async (userId) => {
  const oldKey = `looptalk.secure-device.${userId}`;
  const value = await SecureStore.getItemAsync(oldKey);
  if (!value) return;
  await updateItem(`looptalk:secure-identity:${userId}`, (stored) => stored || value);
  await SecureStore.deleteItemAsync(oldKey);
};
