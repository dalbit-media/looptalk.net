import { closeDesktopCallNotification, notifyDesktopIncomingCall } from "./desktopNotifications";

const noop = () => {};

export const setupNativeCalling = async () => {};
export const startNativeOutgoingCall = noop;
// Browsers ring through the in-app overlay; the packaged desktop app also raises an OS notification.
export const displayNativeIncomingCall = notifyDesktopIncomingCall;
export const answerNativeCall = closeDesktopCallNotification;
export const markNativeCallActive = noop;
export const setNativeCallMuted = noop;
export const endNativeCall = closeDesktopCallNotification;
export const rejectNativeCall = closeDesktopCallNotification;