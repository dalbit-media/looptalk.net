require("dotenv").config();
const fs = require("node:fs");
const { validateEnvironment } = require("./config/environment");
const Sentry = require("@sentry/node");
const next = require("next");

validateEnvironment();
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  release: process.env.RELEASE_VERSION || "looptalk-server@1.0.0",
  sendDefaultPii: false,
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const prisma = require("./db/client");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { sendIncomingCallPush } = require("./utils/pushNotifications");
const { uploadDirectory } = require("./utils/uploadStorage");
const {
  clearPendingCall,
  closeCallInfrastructure,
  getPendingCalls,
  initializeCallInfrastructure,
  savePendingCalls,
} = require("./utils/callInfrastructure");

// Initialize
const app = express();
const server = http.createServer(app);
const isDevelopment = process.argv.includes("--dev");
const nextApp = next({
  dev: isDevelopment,
  dir: path.resolve(__dirname, "../.."),
});
const handleNextRequest = nextApp.getRequestHandler();
const PORT = Number.parseInt(process.env.PORT || "3001", 10) || 3001;
const expoWebBuildDirectory = path.resolve(__dirname, "../../mobile/dist");
const expoWebIndexFile = path.join(expoWebBuildDirectory, "index.html");
const hasExpoWebBuild = fs.existsSync(expoWebIndexFile);
const webClientOrigin = "'self'";

const configuredOrigins = new Set(
  (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (configuredOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Socket.io configuration
const io = socketIo(server, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
  connectionStateRecovery: {
    maxDisconnectionDuration: 20000,
    skipMiddlewares: false,
  },
});
app.set("io", io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (error) {
    next(new Error("Unauthorized"));
  }
});

// Middleware
app.use((req, res, next) => {
  req.requestId = req.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  res.set("x-request-id", req.requestId);
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  req.headers["x-nonce"] = res.locals.cspNonce;
  next();
});
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        frameSrc: ["'self'", webClientOrigin],
      },
    },
  })
);
app.use((req, res, next) => {
  req.headers["content-security-policy"] = res.getHeader("content-security-policy");
  next();
});
app.use((req, res, next) => {
  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  cors({
    ...corsOptions,
    origin: (origin, callback) => {
      if (!origin || origin === requestOrigin || configuredOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
  })(req, res, next);
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use("/uploads", express.static(uploadDirectory, {
  immutable: true,
  maxAge: "7d",
  dotfiles: "deny",
  index: false,
}));
if (hasExpoWebBuild) {
  app.use("/app", express.static(expoWebBuildDirectory, {
    immutable: !isDevelopment,
    maxAge: isDevelopment ? 0 : "1y",
    dotfiles: "deny",
    index: false,
  }));
  app.use("/_expo", express.static(path.join(expoWebBuildDirectory, "_expo"), {
    immutable: !isDevelopment,
    maxAge: isDevelopment ? 0 : "1y",
    dotfiles: "deny",
    index: false,
  }));
  app.use("/assets", express.static(path.join(expoWebBuildDirectory, "assets"), {
    immutable: !isDevelopment,
    maxAge: isDevelopment ? 0 : "1y",
    dotfiles: "deny",
    index: false,
  }));
  app.use("/app", (req, res, next) => {
    if (req.path === "/" || !req.path.includes(".")) {
      res.sendFile(expoWebIndexFile);
      return;
    }
    next();
  });
} else if (!isDevelopment) {
  console.warn(
    `Expo web build not found at ${expoWebIndexFile}; /app will fall back to the Next.js browser client.`
  );
}

// Rate limiting (scoped to the API only, so page loads/static assets are unaffected)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api", limiter);

// Stricter limit on authentication endpoints to slow down brute-force/credential-stuffing attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

// Store every active device connection for accurate presence and preserve
// call ownership briefly while Socket.IO recovers from a network handoff.
const userSockets = new Map();
const activeCallsBySocket = new Map();
const callDisconnectTimers = new Map();
const CALL_DISCONNECT_GRACE_MS = 20000;
const clearActiveCall = (callId) => {
  activeCallsBySocket.forEach((calls, socketId) => {
    calls.delete(callId);
    if (calls.size === 0 && !callDisconnectTimers.has(socketId)) {
      activeCallsBySocket.delete(socketId);
    }
  });
};

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/conversations", require("./routes/conversations"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/media", require("./routes/media"));
app.use("/api/users", require("./routes/users"));
app.use("/api/invitations", require("./routes/invitations"));
app.use("/api/link-preview", require("./routes/linkPreview"));
app.use("/api/calls", require("./routes/calls"));
app.use("/api/reports", require("./routes/reports"));

// Health check
app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store").json({
    status: "ok",
    version: process.env.RELEASE_VERSION || "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.set("Cache-Control", "no-store").json({ status: "ready" });
  } catch (error) {
    Sentry.captureException(error, { tags: { check: "database-readiness" } });
    res.status(503).set("Cache-Control", "no-store").json({ status: "unavailable" });
  }
});

app.use((req, res) => handleNextRequest(req, res));

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  const socketIds = userSockets.get(socket.userId) || new Set();
  socketIds.add(socket.id);
  userSockets.set(socket.userId, socketIds);
  socket.join(`user_${socket.userId}`);

  getPendingCalls(socket.userId)
    .then((calls) => calls.forEach((call) => socket.emit("call:incoming", call)))
    .catch((error) => console.error("Unable to replay pending calls:", error));

  const disconnectTimer = callDisconnectTimers.get(socket.id);
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    callDisconnectTimers.delete(socket.id);
  }

  // Join conversation room
  socket.on("join_conversation", async (conversationId) => {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: socket.userId,
        },
      },
    });
    if (participant) {
      socket.join(`conversation_${conversationId}`);
    }
  });

  // Leave conversation room
  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
  });

  // Typing indicator
  socket.on("typing", (data) => {
    if (!data?.conversationId || !socket.rooms.has(`conversation_${data.conversationId}`)) {
      return;
    }
    socket.to(`conversation_${data.conversationId}`).emit("user_typing", {
      userId: socket.userId,
      userName: typeof data.userName === "string" ? data.userName.slice(0, 100) : "",
    });
  });

  // Stop typing
  socket.on("stop_typing", (data) => {
    if (!data?.conversationId || !socket.rooms.has(`conversation_${data.conversationId}`)) {
      return;
    }
    socket.to(`conversation_${data.conversationId}`).emit("user_stop_typing", {
      userId: socket.userId,
    });
  });

  // Message read
  socket.on("message_read", async (data) => {
    if (!data?.conversationId || !socket.rooms.has(`conversation_${data.conversationId}`)) {
      return;
    }
    try {
      const lastReadAt = new Date();
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: data.conversationId,
            userId: socket.userId,
          },
        },
        data: { lastReadAt },
      });
      socket.to(`conversation_${data.conversationId}`).emit("message_read", {
        conversationId: data.conversationId,
        userId: socket.userId,
        lastReadAt,
      });
    } catch (error) {
      console.error("message_read error:", error);
    }
  });

  // User status
  socket.on("user_status", (data) => {
    io.emit("user_status_changed", {
      userId: socket.userId,
      status: data.status,
    });
  });

  // --- WebRTC call signaling ---
  // All events are scoped to a conversationId and relayed only to the other
  // conversation participants (verified via ConversationParticipant), mirroring
  // the join_conversation authorization pattern above.
  const getOtherParticipantIds = async (conversationId, userId) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        isGroupChat: true,
        participants: { select: { userId: true } },
      },
    });
    const participants = conversation?.participants || [];
    if (!participants.some((participant) => participant.userId === userId)) {
      return null;
    }
    const otherIds = participants
      .map((participant) => participant.userId)
      .filter((id) => id !== userId);
    if (!conversation.isGroupChat && otherIds.length === 1) {
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { userId, blockedUserId: otherIds[0] },
            { userId: otherIds[0], blockedUserId: userId },
          ],
        },
        select: { id: true },
      });
      if (block) return null;
    }
    return otherIds;
  };

  const activeCalls = activeCallsBySocket.get(socket.id) || new Map();
  activeCallsBySocket.set(socket.id, activeCalls);
  const isBoundedString = (value, maxLength = 128) =>
    typeof value === "string" && value.length > 0 && value.length <= maxLength;
  const isValidSdp = (sdp, expectedType) =>
    sdp &&
    sdp.type === expectedType &&
    isBoundedString(sdp.sdp, 1_000_000);
  const isValidCandidate = (candidate) =>
    candidate &&
    isBoundedString(candidate.candidate, 65_536) &&
    (candidate.sdpMid == null || isBoundedString(candidate.sdpMid, 256)) &&
    (candidate.sdpMLineIndex == null ||
      (Number.isInteger(candidate.sdpMLineIndex) && candidate.sdpMLineIndex >= 0));
  const onCallEvent = (eventName, handler) => {
    socket.on(eventName, (data) => {
      Promise.resolve(handler(data)).catch((error) => {
        console.error(`${eventName} signaling error:`, error);
      });
    });
  };
  const validateCallIds = (conversationId, callId) =>
    isBoundedString(conversationId) && isBoundedString(callId);

  onCallEvent("call:invite", async (data) => {
    const { conversationId, callId, callType, sdp } = data || {};
    if (
      !validateCallIds(conversationId, callId) ||
      !["audio", "video"].includes(callType) ||
      !isValidSdp(sdp, "offer")
    ) {
      return;
    }
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    activeCalls.set(callId, { conversationId, otherIds });
    const caller = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { id: true, username: true, displayName: true, profilePicture: true },
    });
    const pendingCall = { callId, conversationId, callType, caller, sdp };
    await savePendingCalls(otherIds, pendingCall);
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:incoming", pendingCall);
    });
    sendIncomingCallPush({
      recipientIds: otherIds,
      callId,
      conversationId,
      callType,
      caller,
    }).catch((error) => console.error("Unable to send incoming-call push:", error));
  });

  onCallEvent("call:answer", async (data) => {
    const { conversationId, callId, sdp } = data || {};
    if (!validateCallIds(conversationId, callId) || !isValidSdp(sdp, "answer")) return;
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    await clearPendingCall([socket.userId, ...otherIds], callId);
    activeCalls.set(callId, { conversationId, otherIds });
    socket.to(`user_${socket.userId}`).emit("call:ended", {
      callId,
      conversationId,
      reason: "answered-elsewhere",
    });
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:answered", { callId, conversationId, sdp });
    });
  });

  onCallEvent("call:offer", async (data) => {
    const { conversationId, callId, sdp } = data || {};
    if (!validateCallIds(conversationId, callId) || !isValidSdp(sdp, "offer")) return;
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    activeCalls.set(callId, { conversationId, otherIds });
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:offer", { callId, conversationId, sdp });
    });
  });

  onCallEvent("call:ice-candidate", async (data) => {
    const { conversationId, callId, candidate } = data || {};
    if (!validateCallIds(conversationId, callId) || !isValidCandidate(candidate)) return;
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:ice-candidate", {
        callId,
        conversationId,
        candidate,
      });
    });
  });

  onCallEvent("call:decline", async (data) => {
    const { conversationId, callId, reason } = data || {};
    if (!validateCallIds(conversationId, callId)) return;
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    await clearPendingCall([socket.userId, ...otherIds], callId);
    clearActiveCall(callId);
    socket.to(`user_${socket.userId}`).emit("call:ended", {
      callId,
      conversationId,
      reason: "declined-elsewhere",
    });
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:declined", {
        callId,
        conversationId,
        reason: isBoundedString(reason, 64) ? reason : "declined",
      });
    });
  });

  onCallEvent("call:end", async (data) => {
    const { conversationId, callId } = data || {};
    if (!validateCallIds(conversationId, callId)) return;
    const otherIds = await getOtherParticipantIds(conversationId, socket.userId);
    if (!otherIds) return;
    await clearPendingCall([socket.userId, ...otherIds], callId);
    clearActiveCall(callId);
    otherIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("call:ended", { callId, conversationId });
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const connectedSockets = userSockets.get(socket.userId);
    connectedSockets?.delete(socket.id);
    if (!connectedSockets?.size) {
      userSockets.delete(socket.userId);
      io.emit("user_offline", { userId: socket.userId });
    }

    if (activeCalls.size > 0) {
      const timer = setTimeout(() => {
        callDisconnectTimers.delete(socket.id);
        const disconnectedCalls = activeCallsBySocket.get(socket.id);
        disconnectedCalls?.forEach(({ conversationId, otherIds }, callId) => {
          otherIds.forEach((userId) => {
            io.to(`user_${userId}`).emit("call:ended", {
              callId,
              conversationId,
              reason: "disconnected",
            });
          });
          clearActiveCall(callId);
        });
        activeCallsBySocket.delete(socket.id);
      }, CALL_DISCONNECT_GRACE_MS);
      timer.unref?.();
      callDisconnectTimers.set(socket.id, timer);
    } else {
      activeCallsBySocket.delete(socket.id);
    }
    console.log("User disconnected:", socket.id);
  });

  // Error handling
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// Global error handling
app.use((err, req, res, next) => {
  Sentry.captureException(err, {
    tags: { requestId: req.requestId },
    extra: { method: req.method, path: req.path },
  });
  console.error(JSON.stringify({
    level: "error",
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    message: err.message,
  }));
  const status = err.status || 500;
  const message =
    status < 500
      ? err.message || "Internal server error"
      : "Internal server error";
  res.status(status).json({ error: message });
});

// Start server only after the distributed adapter is ready. This prevents an
// instance from accepting sockets that other instances cannot yet reach.
const startServer = async () => {
  await nextApp.prepare();
  await initializeCallInfrastructure(io);
  server.listen(PORT, () => {
    console.log(`🚀 LoopTalk server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  Sentry.captureException(error);
  console.error("Unable to start server:", error);
  process.exit(1);
});

// Graceful shutdown
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out; forcing exit.");
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(async (error) => {
    clearTimeout(forceExit);
    try {
      await closeCallInfrastructure();
      await prisma.$disconnect();
    } finally {
      process.exit(error ? 1 : 0);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { app, server, io, prisma };
