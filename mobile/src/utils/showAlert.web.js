import { Alert, Platform } from "react-native";
import { useAlertStore } from "../store/alertStore";

export const showAlert = (title, message, buttons) => {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  useAlertStore.getState().show(title, message, buttons);
};