import * as SecureStore from "expo-secure-store";

const KEY = "looptalk.owner-recovery.v1";
export const readOwnerIdentity = () => SecureStore.getItemAsync(KEY);
export const saveOwnerIdentity = (recoveryKey) => SecureStore.setItemAsync(KEY, recoveryKey);
export const removeOwnerIdentity = () => SecureStore.deleteItemAsync(KEY);
