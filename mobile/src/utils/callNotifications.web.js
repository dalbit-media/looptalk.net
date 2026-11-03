import { getWebPushKey } from "../api/auth";
import { getDesktopBridge, isDesktopApp } from "./desktopApp";
import { webNotificationSupport } from "./webNotificationSupport";

const SERVICE_WORKER_URL = "/app/push-sw.js";
const SERVICE_WORKER_SCOPE = "/app/";

const supported = () => webNotificationSupport() === "ready";

const urlBase64ToUint8Array = (value) => {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const requestPushPermission = async () => {
  if (!isDesktopApp() && !supported()) return webNotificationSupport();
  return Notification.requestPermission();
};

// Electron has no browser push service, so the desktop app never registers a Web Push subscription.
export const getCallPushToken = async () => {
  if (isDesktopApp()) return null;
  if (!supported()) throw new Error("Push notifications are unavailable in this browser");
  let registration;
  try {
    registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
    if (!registration.active) {
      await new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting;
        if (!worker) return reject(new Error("No push worker was installed"));
        const finish = (error) => {
          clearTimeout(timeout);
          worker.removeEventListener("statechange", changed);
          error ? reject(error) : resolve();
        };
        const changed = () => {
          if (worker.state === "activated") finish();
          else if (worker.state === "redundant") finish(new Error("Push worker installation failed"));
        };
        const timeout = setTimeout(() => finish(new Error("Push worker activation timed out")), 15000);
        worker.addEventListener("statechange", changed);
        changed();
      });
    }
  } catch (cause) {
    throw new Error("Could not activate the notification service worker", { cause });
  }
  const { publicKey } = await getWebPushKey();
  const subscription = (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  return JSON.stringify(subscription.toJSON());
};

export const setupCallNotifications = async ({ onMessageOpen } = {}) => {
  const removeDesktopListener = getDesktopBridge()?.onNotificationClick((data) => {
    if (data?.type === "message" && data.conversationId) onMessageOpen?.(data);
  });
  if (!supported()) return () => removeDesktopListener?.();
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
  return () => {
    removeDesktopListener?.();
    navigator.serviceWorker.removeEventListener("message", onMessage);
  };
};