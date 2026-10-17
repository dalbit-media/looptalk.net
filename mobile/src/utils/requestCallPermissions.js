import { PermissionsAndroid, Platform } from "react-native";

export const requestCallPermissions = async (callType) => {
  if (Platform.OS !== "android") return;

  const permissions = callType === "camera"
    ? []
    : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (callType === "video" || callType === "camera") {
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  }
  const results = await PermissionsAndroid.requestMultiple(permissions);
  const granted = permissions.every(
    (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED
  );
  if (!granted) {
    const error = new Error("The requested call media permission was denied");
    error.code = "CALL_PERMISSION_DENIED";
    throw error;
  }
};
