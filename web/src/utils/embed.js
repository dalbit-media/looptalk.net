import { Platform } from "react-native";

// True when running on web inside another site's iframe (e.g. a sidebar widget).
export const isEmbeddedWeb = () =>
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.self !== window.top;

// Opens the current app URL in a full top-level tab, breaking out of the
// embedding iframe so the browser can offer to install/add it to the home screen.
export const openStandaloneApp = () => {
  if (typeof window === "undefined") return;
  window.open(window.location.href, "_blank", "noopener,noreferrer");
};
