const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");
const { uploadDirectory } = require("../utils/uploadStorage");
const { LOOPTALK_USER_ID } = require("../utils/welcomeConversation");

const router = express.Router();
const CACHE_DURATION_MS = 60_000;
let cachedOverview = null;
let cachedAt = 0;
let pendingOverview = null;

const requireAdmin = (req, res, next) => {
  const adminIds = new Set(
    (process.env.ADMIN_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean)
  );
  if (!adminIds.has(req.userId)) {
    return res.status(403).json({ error: "Administrator access is required" });
  }
  next();
};

const getDirectorySize = async (directory) => {
  let bytes = 0;
  let files = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = await getDirectorySize(entryPath);
      bytes += child.bytes;
      files += child.files;
    } else if (entry.isFile()) {
      const stats = await fs.stat(entryPath);
      bytes += stats.size;
      files += 1;
    }
  }
  return { bytes, files };
};

const getInvitationTrend = (invitations) => {
  if (!invitations.length) return [];
  const earliest = invitations.reduce(
    (oldest, invitation) =>
      invitation.createdAt < oldest ? invitation.createdAt : oldest,
    invitations[0].createdAt
  );
  const firstMonth = new Date(
    Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1)
  );
  const now = new Date();
  const buckets = [];
  for (
    let month = new Date(firstMonth);
    month <= now;
    month.setUTCMonth(month.getUTCMonth() + 1)
  ) {
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: month.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" }),
      created: 0,
      accepted: 0,
    });
  }
  const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const invitation of invitations) {
    const createdKey = `${invitation.createdAt.getUTCFullYear()}-${String(invitation.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const createdBucket = byMonth.get(createdKey);
    if (createdBucket) createdBucket.created += 1;
    if (invitation.acceptedAt) {
      const acceptedKey = `${invitation.acceptedAt.getUTCFullYear()}-${String(invitation.acceptedAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const acceptedBucket = byMonth.get(acceptedKey);
      if (acceptedBucket) acceptedBucket.accepted += 1;
    }
  }
  return buckets;
};

const collectOverview = async () => {
  const [
    users,
    conversations,
    messageCount,
    invitations,
    acceptedInvitations,
    invitationRecords,
    messages,
    mediaStorage,
    webAppInstalls,
    secureMessageCount,
    securePendingDeliveries,
    securePayloadStorage,
  ] = await Promise.all([
    prisma.user.count({ where: { status: { not: "SYSTEM" } } }),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.invitation.count(),
    prisma.invitation.count({ where: { status: "ACCEPTED" } }),
    prisma.invitation.findMany({
      select: { createdAt: true, acceptedAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.message.findMany({
      where: { deletedAt: null },
      select: {
        senderId: true,
        content: true,
        messageType: true,
        fileSize: true,
        createdAt: true,
        deletedAt: true,
        conversation: {
          select: {
            kind: true,
            participants: { select: { userId: true, joinedAt: true, lastReadAt: true } },
          },
        },
      },
    }),
    getDirectorySize(uploadDirectory),
    prisma.webAppInstallation.count(),
    prisma.secureDispatch.count({ where: { kind: "message" } }),
    prisma.secureEnvelope.count(),
    prisma.$queryRaw`SELECT COUNT(*) AS payloads, COALESCE(SUM(LENGTH(ciphertext)), 0) AS bytes FROM SecurePayload`,
  ]);

  let unreadDeliveries = 0;
  let estimatedUnreadPayloadBytes = 0;
  let estimatedStoredMessagePayloadBytes = 0;
  for (const message of messages) {
    const payloadBytes =
      Buffer.byteLength(message.content || "", "utf8") + (message.fileSize || 0);
    estimatedStoredMessagePayloadBytes += payloadBytes;
    for (const participant of message.conversation.participants) {
      if (
        !message.deletedAt &&
        (participant.userId !== message.senderId ||
          (message.conversation.kind === "WELCOME" && message.messageType === "SYSTEM")) &&
        participant.joinedAt <= message.createdAt &&
        (!participant.lastReadAt || participant.lastReadAt < message.createdAt)
      ) {
        unreadDeliveries += 1;
        estimatedUnreadPayloadBytes += payloadBytes;
      }
    }
  }

  const acceptedWithoutTimestamp = invitationRecords.filter(
    (invitation) => invitation.status === "ACCEPTED" && !invitation.acceptedAt
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      users,
      conversations,
      messages: messageCount + secureMessageCount,
      legacyMessages: messageCount,
      encryptedMessageReceipts: secureMessageCount,
      invitations,
      acceptedInvitations,
      webAppInstalls,
    },
    invitationTrend: getInvitationTrend(invitationRecords),
    invitationAcceptance: {
      dated: acceptedInvitations - acceptedWithoutTimestamp,
      historicalAcceptedWithoutTimestamp: acceptedWithoutTimestamp,
    },
    storage: {
      mediaBytes: mediaStorage.bytes,
      mediaFiles: mediaStorage.files,
      estimatedStoredMessagePayloadBytes,
      unreadDeliveries,
      estimatedUnreadPayloadBytes,
      legacyRetainedMessages: messages.length,
      legacyRetainedPayloadBytes: estimatedStoredMessagePayloadBytes,
      totalEstimatedMessagePayloadBytes: estimatedStoredMessagePayloadBytes + Number(securePayloadStorage[0].bytes),
      encryptedPendingPayloads: Number(securePayloadStorage[0].payloads),
      encryptedPendingBytes: Number(securePayloadStorage[0].bytes),
      encryptedPendingDeviceDeliveries: securePendingDeliveries,
      localClientBytes: null,
      userManagedBackupsSupported: false,
    },
    privacy: {
      endToEndEncryptionEnabled: true,
      serverCanReadMessageContent: true,
      privateChatServerCanReadMessageContent: false,
      legacyHistoryMayContainPlaintext: true,
      welcomeMessagesArePlaintext: true,
    },
  };
};

const sendOverview = async (req, res) => {
  res.set("Cache-Control", "no-store");
  let overviewRequest;
  try {
    if (cachedOverview && Date.now() - cachedAt < CACHE_DURATION_MS) {
      return res.json(cachedOverview);
    }
    if (!pendingOverview) {
      pendingOverview = collectOverview().then((overview) => {
        cachedOverview = overview;
        cachedAt = Date.now();
        return overview;
      });
    }
    overviewRequest = pendingOverview;
    const overview = await overviewRequest;
    res.json(overview);
  } catch (error) {
    console.error("Error collecting service statistics:", error);
    res.status(500).json({ error: "Failed to collect statistics" });
  } finally {
    if (overviewRequest && pendingOverview === overviewRequest) {
      pendingOverview = null;
    }
  }
};

router.get("/public-overview", sendOverview);
router.get("/overview", authMiddleware, requireAdmin, sendOverview);

router.get("/welcome-replies", authMiddleware, requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { before } = req.query;
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    (before !== undefined && (typeof before !== "string" || !before || before.length > 100))
  ) {
    return res.status(400).json({ error: "Invalid pagination parameters" });
  }
  try {
    const where = {
      conversation: { kind: "WELCOME" },
      messageType: { not: "SYSTEM" },
      senderId: { not: LOOPTALK_USER_ID },
    };
    if (before) {
      const cursor = await prisma.message.findFirst({
        where: { ...where, id: before },
        select: { id: true },
      });
      if (!cursor) return res.status(400).json({ error: "Invalid pagination cursor" });
    }
    const replies = await prisma.message.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        content: true,
        messageType: true,
        mediaUrl: true,
        fileName: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        sender: {
          select: { id: true, username: true, publicUsername: true, publicDisplayName: true, displayName: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });
    const hasMore = replies.length > limit;
    const page = replies.slice(0, limit);
    res.json({
      replies: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Error fetching welcome replies:", error);
    res.status(500).json({ error: "Failed to fetch welcome replies" });
  }
});

module.exports = router;
