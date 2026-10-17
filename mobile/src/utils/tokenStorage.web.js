import AsyncStorage from "@react-native-async-storage/async-storage";

export const getItemAsync = (key) => AsyncStorage.getItem(key);

export const setItemAsync = async (key, value) => {
  await AsyncStorage.setItem(key, value);
};

export const deleteItemAsync = async (key) => {
  await AsyncStorage.removeItem(key);
};