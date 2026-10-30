import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getDeviceLanguage, setLanguage, t } from "../i18n/i18n";
import { showAlert } from "../utils/showAlert";
import { getOwnerIdentity, readOwnerVault, updateOwnerVault } from "../utils/ownerVault";

const LANGUAGE_KEY = "language";
const THEME_KEY = "themeMode";
const CHAT_TEXT_SIZE_KEY = "chatTextSize";
const NOTIFICATIONS_KEY = "notificationsEnabled";
const SUPPORTED_LANGUAGES = ["ko"];
const THEME_MODES = ["system", "light", "dark"];
const CHAT_TEXT_SIZES = ["standard", "large", "extraLarge"];
const persistPreference = async (key, value) => {
  if (getOwnerIdentity()) {
    await updateOwnerVault((current) => ({
      ...current, preferences: { ...current.preferences, [key]: value },
    }));
  } else {
    await AsyncStorage.setItem(key, String(value));
  }
};
const savePreference = async (key, value, apply) => {
  try {
    await persistPreference(key, value);
    apply();
  } catch {
    showAlert(t("common.error"), t("privacy.preferenceSaveFailed"));
  }
};

export const usePreferencesStore = create((set) => ({
  language: getDeviceLanguage(),
  themeMode: "system",
  chatTextSize: "standard",
  notificationsEnabled: false,
  loadOwnerPreferences: () => {
    const preferences = readOwnerVault().preferences;
    set({
      themeMode: THEME_MODES.includes(preferences[THEME_KEY]) ? preferences[THEME_KEY] : "system",
      chatTextSize: CHAT_TEXT_SIZES.includes(preferences[CHAT_TEXT_SIZE_KEY])
        ? preferences[CHAT_TEXT_SIZE_KEY] : "standard",
      notificationsEnabled: preferences[NOTIFICATIONS_KEY] === true,
    });
  },
  resetOwnerPreferences: () => set({
    themeMode: "system", chatTextSize: "standard", notificationsEnabled: false,
  }),

  initialize: async () => {
    let storageReadFailed = false;
    let storageWriteFailed = false;
    const readPreference = async (key) => {
      try {
        return await AsyncStorage.getItem(key);
      } catch (error) {
        storageReadFailed = true;
        console.error(`Unable to read local preference "${key}":`, error);
        return null;
      }
    };
    const [savedLanguage, savedThemeMode, savedChatTextSize, savedNotifications] =
      await Promise.all([
        readPreference(LANGUAGE_KEY),
        readPreference(THEME_KEY),
        readPreference(CHAT_TEXT_SIZE_KEY),
        readPreference(NOTIFICATIONS_KEY),
      ]);

    const language = getDeviceLanguage();
    const themeMode = THEME_MODES.includes(savedThemeMode)
      ? savedThemeMode
      : "system";
    const chatTextSize = CHAT_TEXT_SIZES.includes(savedChatTextSize)
      ? savedChatTextSize
      : "standard";
    const notificationsEnabled = savedNotifications === "true";

    setLanguage(language);
    set({ language, themeMode, chatTextSize, notificationsEnabled });
    if (savedLanguage !== language) {
      try {
        await AsyncStorage.setItem(LANGUAGE_KEY, language);
      } catch (error) {
        storageWriteFailed = true;
        console.error("Unable to persist the device language preference:", error);
      }
    }
    if (storageReadFailed || storageWriteFailed) {
      const messageKey = storageReadFailed
        ? "privacy.preferenceLoadFailed"
        : "privacy.preferenceSaveFailed";
      showAlert(t("common.error"), t(messageKey));
    }
  },

  setLanguage: async (language) => {
    if (!SUPPORTED_LANGUAGES.includes(language)) return;
    await savePreference(LANGUAGE_KEY, language, () => {
      setLanguage(language);
      set({ language });
    });
  },

  setThemeMode: async (themeMode) => {
    if (!THEME_MODES.includes(themeMode)) return;
    await savePreference(THEME_KEY, themeMode, () => set({ themeMode }));
  },

  setChatTextSize: async (chatTextSize) => {
    if (!CHAT_TEXT_SIZES.includes(chatTextSize)) return;
    await savePreference(CHAT_TEXT_SIZE_KEY, chatTextSize, () => set({ chatTextSize }));
  },

  setNotificationsEnabled: async (notificationsEnabled) => {
    await savePreference(NOTIFICATIONS_KEY, notificationsEnabled, () => set({ notificationsEnabled }));
  },
}));