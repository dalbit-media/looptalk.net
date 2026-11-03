import { Platform } from "react-native";
import { registerDeviceToken } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { usePreferencesStore } from "../store/preferencesStore";
import { getCallPushToken, requestPushPermission } from "./callNotifications";
import { isDesktopApp } from "./desktopApp";

// Most browsers support push in a tab; iOS requires a Home Screen web app.
export const browserNotificationPermission = () =>
  Platform.OS === "web" && typeof Notification !== "undefined" ? Notification.permission : null;

// Subscribes this device for push. Callers must already hold notification permission.
export const registerPushDevice = async (authToken = useAuthStore.getState().token) => {
  const deviceToken = await getCallPushToken();
  if (!deviceToken && !isDesktopApp()) throw new Error("No push subscription was created");
  if (deviceToken) await registerDeviceToken(deviceToken, Platform.OS, authToken);
};

// Must run from a tap so browsers show the permission prompt.
export const enablePushNotifications = async ({ onPermissionGranted } = {}) => {
  const permission = await requestPushPermission();
  if (permission !== "granted") return permission;
  onPermissionGranted?.();
  await registerPushDevice();
  await usePreferencesStore.getState().setNotificationsEnabled(true);
  if (!usePreferencesStore.getState().notificationsEnabled) {
    throw new Error("The notification preference could not be saved");
  }
  return permission;
};
