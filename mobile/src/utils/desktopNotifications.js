import { t } from "../i18n/i18n";
import { usePreferencesStore } from "../store/preferencesStore";
import { getDesktopBridge } from "./desktopApp";
import { getMessagePreview } from "./messagePreview";

const windowFocused = () =>
  typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();

const nameOf = (user) => user?.displayName || user?.username || "LoopTalk";

// Content is built lazily so browsers and native apps skip the work entirely.
const show = (buildNotification) => {
  const bridge = getDesktopBridge();
  if (!bridge || !usePreferencesStore.getState().notificationsEnabled) return;
  bridge.notify(buildNotification()).catch((error) => console.error("Could not show desktop notification:", error));
};

export const notifyDesktopMessage = (message, { isOpenConversation = false } = {}) => {
  if (isOpenConversation && windowFocused()) return;
  show(() => ({
    title: nameOf(message.sender),
    body: getMessagePreview(message, t) || t("notifications.newMessage"),
    tag: `conversation-${message.conversationId}`,
    data: { type: "message", conversationId: message.conversationId },
  }));
};

export const notifyDesktopIncomingCall = (call) => {
  if (windowFocused()) return;
  show(() => ({
    title: nameOf(call.caller),
    body: t(call.callType === "video" ? "calls.incomingVideoCall" : "calls.incomingAudioCall"),
    tag: `call-${call.callId}`,
    requireInteraction: true,
    data: { type: "incoming_call", callId: call.callId, conversationId: call.conversationId },
  }));
};

export const closeDesktopCallNotification = (callId) => {
  if (!callId) return;
  getDesktopBridge()?.closeNotification(`call-${callId}`)
    .catch((error) => console.error("Could not close desktop call notification:", error));
};
