import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getDeviceLanguage, setLanguage } from "../i18n/i18n";

const LANGUAGE_KEY = "language";
const THEME_KEY = "themeMode";
const NOTIFICATIONS_KEY = "notificationsEnabled";
const SUPPORTED_LANGUAGES = ["ko", "en", "ja"];
const THEME_MODES = ["system", "light", "dark"];

export const usePreferencesStore = create((set) => ({
  language: getDeviceLanguage(),
  themeMode: "system",
  notificationsEnabled: false,

  initialize: async () => {
    const [savedLanguage, savedThemeMode, savedNotifications] =
      await Promise.all([
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(NOTIFICATIONS_KEY),
      ]);

    const language = SUPPORTED_LANGUAGES.includes(savedLanguage)
      ? savedLanguage
      : getDeviceLanguage();
    const themeMode = THEME_MODES.includes(savedThemeMode)
      ? savedThemeMode
      : "system";
    const notificationsEnabled = savedNotifications === "true";

    setLanguage(language);
    set({ language, themeMode, notificationsEnabled });
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

  setNotificationsEnabled: async (notificationsEnabled) => {
    set({ notificationsEnabled });
    await AsyncStorage.setItem(
      NOTIFICATIONS_KEY,
      String(notificationsEnabled)
    );
  },
}));