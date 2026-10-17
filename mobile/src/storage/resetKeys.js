const preferenceKeys = new Set(["token", "language", "themeMode", "chatTextSize", "notificationsEnabled"]);

export const isAppStorageKey = (key) => typeof key === "string" && (
  key.startsWith("looptalk:") || key.startsWith("looptalk.") || preferenceKeys.has(key)
);

export const legacyDeviceUsers = (keys) => [...new Set(keys
  .map((key) => typeof key === "string"
    ? key.match(/^looptalk:(?:conversation|message-outbox|secure-identity|secure-dispatch|secure-received|trusted-device):([^:]+)/)?.[1]
    : null)
  .filter(Boolean))];
