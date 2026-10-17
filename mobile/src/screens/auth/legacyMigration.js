import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../../config/environment";

const migrationError = (code) => {
  const error = new Error("Unable to prepare the encrypted legacy snapshot");
  error.code = code;
  return error;
};

const embedLegacyPhoto = async (photo, token) => {
  if (!photo) return null;
  if (photo.startsWith("data:image/")) {
    if (photo.length > 600000) throw migrationError("PROFILE_PHOTO_TOO_LARGE");
    return photo;
  }
  try {
    const base = new URL(API_URL);
    const url = new URL(photo.startsWith("/") ? `${API_URL}${photo}` : photo, API_URL);
    if (url.origin !== base.origin) throw migrationError("LEGACY_PHOTO_UNAVAILABLE");
    const response = await fetch(url.href, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw migrationError("LEGACY_PHOTO_UNAVAILABLE");
    const blob = await response.blob();
    if (blob.size > 450000) throw migrationError("PROFILE_PHOTO_TOO_LARGE");
    if (!blob.type.startsWith("image/")) throw migrationError("LEGACY_PHOTO_UNAVAILABLE");
    const embedded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(migrationError("LEGACY_PHOTO_UNAVAILABLE"));
      reader.readAsDataURL(blob);
    });
    if (typeof embedded !== "string" || embedded.length > 600000) {
      throw migrationError("PROFILE_PHOTO_TOO_LARGE");
    }
    return embedded;
  } catch (error) {
    if (error.code) throw error;
    throw migrationError("LEGACY_PHOTO_UNAVAILABLE");
  }
};

export const createLegacySnapshot = async (legacy, currentPreferences, token, skipPhoto) => {
  if (!legacy?.profile || !Array.isArray(legacy.contacts)) {
    throw migrationError("INVALID_LEGACY_SNAPSHOT");
  }
  const profile = {};
  for (const key of ["displayName", "bio", "email", "phoneNumber"]) {
    const value = legacy.profile[key];
    if (value !== null && value !== undefined && typeof value !== "string") {
      throw migrationError("INVALID_LEGACY_SNAPSHOT");
    }
    profile[key] = typeof value === "string" ? value.trim() : null;
  }
  profile.profilePicture = skipPhoto ? null : await embedLegacyPhoto(legacy.profile.profilePicture, token);
  const contacts = legacy.contacts.map((contact) => {
    if (!contact || typeof contact.contactUserId !== "string") throw migrationError("INVALID_LEGACY_SNAPSHOT");
    return {
      ...contact,
      contactUser: {
        id: contact.contactUserId, username: contact.contactUserId, displayName: contact.contactUserId,
      },
    };
  });
  const saved = await AsyncStorage.multiGet(["themeMode", "chatTextSize", "notificationsEnabled"]);
  const local = Object.fromEntries(saved);
  return {
    profile, contacts, invitations: [], conversationNames: {},
    preferences: {
      themeMode: ["system", "light", "dark"].includes(local.themeMode)
        ? local.themeMode : currentPreferences.themeMode,
      chatTextSize: ["standard", "large", "extraLarge"].includes(local.chatTextSize)
        ? local.chatTextSize : currentPreferences.chatTextSize,
      notificationsEnabled: local.notificationsEnabled === null
        ? currentPreferences.notificationsEnabled : local.notificationsEnabled === "true",
    },
  };
};
