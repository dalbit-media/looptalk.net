import { AppState, Platform } from "react-native";

export const isPresenceActive = () =>
  Platform.OS === "web"
    ? document.visibilityState !== "hidden"
    : AppState.currentState == null || AppState.currentState === "active";

export const attachPresenceLifecycle = (socket) => {
  const publish = () => {
    const active = isPresenceActive();
    socket.auth = { ...socket.auth, presenceActive: active };
    if (socket.connected) {
      socket.emit("user_status", { status: active ? "online" : "offline" });
    }
  };
  const subscription = AppState.addEventListener("change", publish);
  if (Platform.OS === "web") document.addEventListener("visibilitychange", publish);
  const heartbeat = setInterval(() => {
    if (isPresenceActive()) publish();
  }, 60_000);
  return () => {
    subscription.remove();
    if (Platform.OS === "web") document.removeEventListener("visibilitychange", publish);
    clearInterval(heartbeat);
  };
};
