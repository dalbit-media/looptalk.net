const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}

const parsedApiUrl = new URL(configuredApiUrl);

if (!["http:", "https:"].includes(parsedApiUrl.protocol)) {
  throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
}

export const API_URL = configuredApiUrl.replace(/\/+$/, "");