import { Alert } from "react-native";

export const showAlert = (title, message, buttons) => {
  Alert.alert(title, message, buttons);
};
