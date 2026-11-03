export const webNotificationSupport = () => {
  if (typeof window === "undefined") return "unsupported";
  if (window.isSecureContext === false) return "https";
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = window.navigator;
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (ios && !window.navigator.standalone && !window.matchMedia?.("(display-mode: standalone)").matches) {
    return "ios";
  }
  return "serviceWorker" in window.navigator && "PushManager" in window && "Notification" in window
    ? "ready" : "unsupported";
};
