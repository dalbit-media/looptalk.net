/* LoopTalk web push service worker, served from /app/push-sw.js with scope /app/. */
const APP_URL = "/app/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const windowClients = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "LoopTalk", body: event.data ? event.data.text() : "" };
  }
  const data = payload.data || {};
  event.waitUntil((async () => {
    const clients = await windowClients();
    const foreground = clients.some((client) => client.visibilityState === "visible" && client.focused);
    // The open app already receives messages over its socket; calls always ring.
    if (foreground && data.type !== "incoming_call") return;
    await self.registration.showNotification(payload.title || "LoopTalk", {
      body: payload.body || "",
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      requireInteraction: Boolean(payload.requireInteraction),
      icon: "/site/app-icon-192.png",
      badge: "/site/app-icon-192.png",
      data,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const clients = await windowClients();
    const existing = clients.find((client) => new URL(client.url).pathname.startsWith(APP_URL));
    if (existing) {
      await existing.focus();
      existing.postMessage({ source: "looptalk-push", data });
      return;
    }
    const params = data.conversationId ? `?conversation=${encodeURIComponent(data.conversationId)}` : "";
    await self.clients.openWindow(`${APP_URL}${params}`);
  })());
});
