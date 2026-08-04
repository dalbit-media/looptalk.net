import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isWeb = Platform.OS === "web";

export const getItemAsync = (key) =>
  isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);

export const setItemAsync = (key, value) =>
  isWeb ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);

export const deleteItemAsync = (key) =>
  isWeb ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key);