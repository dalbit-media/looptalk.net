import * as SecureStore from "expo-secure-store";

export const getItemAsync = (key) =>
  SecureStore.getItemAsync(key);

export const setItemAsync = (key, value) =>
  SecureStore.setItemAsync(key, value);

export const deleteItemAsync = (key) =>
  SecureStore.deleteItemAsync(key);
