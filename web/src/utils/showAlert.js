import { Alert, Platform } from "react-native";
import { useAlertStore } from "../store/alertStore";

// Drop-in replacement for React Native's Alert.alert(title, message, buttons).
// On native platforms it behaves identically. On web, react-native-web's
// Alert.alert() is a no-op stub, so we route the request to a small custom
// modal (see components/WebAlertHost.js) rendered once near the app root.
export const showAlert = (title, message, buttons) => {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  useAlertStore.getState().show(title, message, buttons);
};
