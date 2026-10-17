const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") return null;
  try { return new URL(value.trim()).origin; } catch { return null; }
};

const createCorsPolicy = ({ environment = process.env, isDevelopment = false } = {}) => {
  const configuredOrigins = new Set((environment.CORS_ORIGIN || "").split(",")
    .map(normalizeOrigin).filter(Boolean));
  const publicOrigin = normalizeOrigin(environment.PUBLIC_URL);
  const allowLoopback = isDevelopment || environment.NODE_ENV !== "production";
  return (req, callback) => {
    const requestOrigin = normalizeOrigin(`${req.socket?.encrypted ? "https" : "http"}://${req.headers.host}`);
    callback(null, {
      origin: (origin, done) => {
        const normalized = normalizeOrigin(origin);
        let loopback = false;
        if (normalized && allowLoopback) {
          loopback = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(normalized).hostname);
        }
        if (!origin || (normalized && (normalized === requestOrigin ||
            normalized === publicOrigin || configuredOrigins.has(normalized) || loopback))) {
          return done(null, true);
        }
        return done(new Error("Origin is not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });
  };
};

module.exports = { createCorsPolicy };
