const messengerBlobSource = (req) =>
  req.path === "/app" || req.path.startsWith("/app/") ? "blob:" : "";

const createContentSecurityPolicy = ({ isDevelopment, webClientOrigin }) => ({
  directives: {
    scriptSrc: [
      "'self'",
      (req, res) => `'nonce-${res.locals.cspNonce}'`,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    frameSrc: ["'self'", webClientOrigin],
    // Private IndexedDB attachments are materialized as same-browser object
    // URLs. Permit them only for messenger documents, never scripts or frames.
    connectSrc: ["'self'", messengerBlobSource],
    imgSrc: ["'self'", "data:", messengerBlobSource],
    mediaSrc: ["'self'", messengerBlobSource],
  },
});

module.exports = { createContentSecurityPolicy };
