export const getApiUrl = () =>
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  (typeof window !== "undefined" && process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : typeof window !== "undefined"
      ? window.location.origin
      : "");
