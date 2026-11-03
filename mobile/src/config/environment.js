import { version } from "../../../package.json";
import buildLabel from "./buildLabel";

export const BUILD_LABEL = buildLabel(version);

const PRODUCTION_API_URL = "https://looptalk.net";
const browserApiUrl =
  typeof window !== "undefined" ? window.location.origin : undefined;
const developmentFallbackApiUrl =
  typeof window !== "undefined" && process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : undefined;
// Release native builds talk to production unless EXPO_PUBLIC_API_URL overrides it.
const releaseFallbackApiUrl =
  process.env.NODE_ENV === "production" ? PRODUCTION_API_URL : undefined;
const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  developmentFallbackApiUrl ||
  browserApiUrl ||
  releaseFallbackApiUrl;

if (!configuredApiUrl) {
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}

const parsedApiUrl = new URL(configuredApiUrl);

if (!["http:", "https:"].includes(parsedApiUrl.protocol)) {
  throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
}

export const API_URL = configuredApiUrl.replace(/\/+$/, "");