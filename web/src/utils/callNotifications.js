import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { displayNativeIncomingCall } from "./nativeCalling";

export const getCallPushToken = async () => {
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("An EAS project ID is required for push notifications");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
};

export const setupCallNotifications = async ({ onCallAction, onMessageOpen }) => {
  await Notifications.setNotificationChannelAsync("incoming-calls", {
    name: "Incoming calls",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 800, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync("incoming-call", [
    { identifier: "answer", buttonTitle: "Answer", options: { opensAppToForeground: true } },
    { identifier: "decline", buttonTitle: "Decline", options: { isDestructive: true } },
  ]);
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 180],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });

  const displayCall = (notification) => {
    const data = notification?.request?.content?.data;
    if (data?.type === "incoming_call") displayNativeIncomingCall(data);
  };
  const handleResponse = (response) => {
    const data = response?.notification?.request?.content?.data;
    if (data?.type === "message") {
      onMessageOpen?.(data);
      return;
    }
    if (data?.type === "incoming_call") {
      displayNativeIncomingCall(data);
      if (["answer", "decline"].includes(response.actionIdentifier)) {
        onCallAction(data.callId, response.actionIdentifier);
      }
    }
  };

  const receivedSubscription = Notifications.addNotificationReceivedListener(displayCall);
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  const initialResponse = await Notifications.getLastNotificationResponseAsync();
  if (initialResponse) {
    handleResponse(initialResponse);
    await Notifications.clearLastNotificationResponseAsync();
  }
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};