import { getWebPushKey } from "../api/auth";

const SERVICE_WORKER_URL = "/app/push-sw.js";
const SERVICE_WORKER_SCOPE = "/app/";

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const urlBase64ToUint8Array = (value) => {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const requestPushPermission = async () => {
  if (!supported()) return "unsupported";
  return Notification.requestPermission();
};

export const getCallPushToken = async () => {
  if (!supported()) throw new Error("Push notifications are unavailable in this browser");
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
  await navigator.serviceWorker.ready;
  const { publicKey } = await getWebPushKey();
  const subscription = (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  return JSON.stringify(subscription.toJSON());
};

export const setupCallNotifications = async ({ onMessageOpen } = {}) => {
  if (!supported()) return () => {};
  const onMessage = (event) => {
    if (event.data?.source === "looptalk-push" && event.data.data?.conversationId) {
      onMessageOpen?.(event.data.data);
    }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  // A notification clicked while the app was closed opens /app/?conversation=<id>.
  const url = new URL(window.location.href);
  const conversationId = url.searchParams.get("conversation");
  if (conversationId) {
    url.searchParams.delete("conversation");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    onMessageOpen?.({ conversationId });
  }
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
};