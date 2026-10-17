import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "looptalk.owner-recovery.v1";
export const readOwnerIdentity = () => AsyncStorage.getItem(KEY);
export const saveOwnerIdentity = (recoveryKey) => AsyncStorage.setItem(KEY, recoveryKey);
export const removeOwnerIdentity = () => AsyncStorage.removeItem(KEY);
