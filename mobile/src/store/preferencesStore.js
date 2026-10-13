import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getDeviceLanguage, setLanguage } from "../i18n/i18n";

const LANGUAGE_KEY = "language";
const THEME_KEY = "themeMode";
const CHAT_TEXT_SIZE_KEY = "chatTextSize";
const NOTIFICATIONS_KEY = "notificationsEnabled";
const SUPPORTED_LANGUAGES = ["ko", "en", "ja"];
const THEME_MODES = ["system", "light", "dark"];
const CHAT_TEXT_SIZES = ["standard", "large", "extraLarge"];

export const usePreferencesStore = create((set) => ({
  language: getDeviceLanguage(),
  themeMode: "system",
  chatTextSize: "standard",
  notificationsEnabled: false,

  initialize: async () => {
    const [savedLanguage, savedThemeMode, savedChatTextSize, savedNotifications] =
      await Promise.all([
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CHAT_TEXT_SIZE_KEY),
        AsyncStorage.getItem(NOTIFICATIONS_KEY),
      ]);

    const language = SUPPORTED_LANGUAGES.includes(savedLanguage)
      ? savedLanguage
      : getDeviceLanguage();
    const themeMode = THEME_MODES.includes(savedThemeMode)
      ? savedThemeMode
      : "system";
    const chatTextSize = CHAT_TEXT_SIZES.includes(savedChatTextSize)
      ? savedChatTextSize
      : "standard";
    const notificationsEnabled = savedNotifications === "true";

    setLanguage(language);
    set({ language, themeMode, chatTextSize, notificationsEnabled });
  },

  setLanguage: async (language) => {
    if (!SUPPORTED_LANGUAGES.includes(language)) return;
    setLanguage(language);
    set({ language });
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  },

  setThemeMode: async (themeMode) => {
    if (!THEME_MODES.includes(themeMode)) return;
    set({ themeMode });
    await AsyncStorage.setItem(THEME_KEY, themeMode);
  },

  setChatTextSize: async (chatTextSize) => {
    if (!CHAT_TEXT_SIZES.includes(chatTextSize)) return;
    set({ chatTextSize });
    await AsyncStorage.setItem(CHAT_TEXT_SIZE_KEY, chatTextSize);
  },

  setNotificationsEnabled: async (notificationsEnabled) => {
    set({ notificationsEnabled });
    await AsyncStorage.setItem(
      NOTIFICATIONS_KEY,
      String(notificationsEnabled)
    );
  },
}));