import { Platform } from "react-native";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const webOrigin = Platform.OS === "web" && typeof window !== "undefined"
  ? window.location.origin
  : null;

if (!configuredApiUrl && !webOrigin) {
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}

const apiUrl = configuredApiUrl || webOrigin || "http://localhost:3000";
const parsedApiUrl = new URL(apiUrl);

if (!["http:", "https:"].includes(parsedApiUrl.protocol)) {
  throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
}

export const API_URL = apiUrl.replace(/\/+$/, "");