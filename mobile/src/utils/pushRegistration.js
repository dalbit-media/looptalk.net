import { Platform } from "react-native";
import { registerDeviceToken } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { usePreferencesStore } from "../store/preferencesStore";
import { getCallPushToken, requestPushPermission } from "./callNotifications";

// Browser tabs get web push without installing anything; permission is the only requirement.
export const browserNotificationPermission = () =>
  Platform.OS === "web" && typeof Notification !== "undefined" ? Notification.permission : null;

// Subscribes this device for push. Callers must already hold notification permission.
export const registerPushDevice = async (authToken = useAuthStore.getState().token) => {
  const deviceToken = await getCallPushToken();
  if (deviceToken) await registerDeviceToken(deviceToken, Platform.OS, authToken);
};

// Must run from a tap so browsers show the permission prompt.
export const enablePushNotifications = async () => {
  const permission = await requestPushPermission();
  if (permission !== "granted") return permission;
  await registerPushDevice();
  await usePreferencesStore.getState().setNotificationsEnabled(true);
  return permission;
};
