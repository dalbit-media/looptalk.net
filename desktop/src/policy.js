const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "media",
  "display-capture",
  "clipboard-sanitized-write",
  "fullscreen",
]);

const isLoopbackHost = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

// Only HTTPS (or plain HTTP on loopback for development) may host the messenger.
const resolveAppUrl = (configuredUrl, override) => {
  const url = new URL(override || configuredUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new Error(`LoopTalk desktop requires an HTTPS app URL, received ${url.origin}`);
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url;
};

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isAppOrigin = (value, appUrl) => parseUrl(value)?.origin === appUrl.origin;

const isExternalWebUrl = (value) => ["http:", "https:", "mailto:"].includes(parseUrl(value)?.protocol);

const isAllowedPermission = (permission, requestingUrl, appUrl) =>
  ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(requestingUrl, appUrl);

const text = (value, limit) => (typeof value === "string" ? value.slice(0, limit) : "");
const id = (value) => (typeof value === "string" && /^[\w:.-]{1,128}$/.test(value) ? value : undefined);

// Renderer input is untrusted: keep only the fields the native notification needs.
const sanitizeNotification = (input = {}) => {
  const data = input.data && typeof input.data === "object" ? input.data : {};
  return {
    title: text(input.title, 120) || "LoopTalk",
    body: text(input.body, 300),
    tag: id(input.tag),
    silent: input.silent === true,
    requireInteraction: input.requireInteraction === true,
    data: {
      type: id(data.type),
      conversationId: id(data.conversationId),
      callId: id(data.callId),
    },
  };
};

const linuxAutostartEntry = ({ name, execPath, args = [] }) => {
  const quote = (value) => `"${String(value).replace(/(["\\`$])/g, "\\$1")}"`;
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${name}`,
    `Exec=${[execPath, ...args].map(quote).join(" ")}`,
    "X-GNOME-Autostart-enabled=true",
    "Terminal=false",
    "",
  ].join("\n");
};

module.exports = {
  ALLOWED_PERMISSIONS,
  isAllowedPermission,
  isAppOrigin,
  isExternalWebUrl,
  linuxAutostartEntry,
  resolveAppUrl,
  sanitizeNotification,
};
