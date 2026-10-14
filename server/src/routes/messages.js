const path = require("path");
const fs = require("fs").promises;
const express = require("express");
const sharp = require("sharp");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");
const { sendMessagePush } = require("../utils/pushNotifications");
const { uploadDirectory } = require("../utils/uploadStorage");

const router = express.Router();

const MEDIA_TYPES = new Set(["IMAGE", "VIDEO", "VOICE", "DRAWING", "FILE"]);
const MAX_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const SENDER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  profilePicture: true,
};

const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  reactions: { select: { userId: true, emoji: true } },
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      messageType: true,
      deletedAt: true,
      sender: { select: SENDER_SELECT },
    },
  },
};

const getParticipantIds = async (conversationId, userId) => {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  if (!participants.some((participant) => participant.userId === userId)) {
    return null;
  }

  return participants.map((participant) => participant.userId);
};

const isDirectConversationBlocked = async (conversationId, userId, participantIds) => {
  if (participantIds.length !== 2) return false;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroupChat: true },
  });
  if (!conversation || conversation.isGroupChat) return false;
  const otherUserId = participantIds.find((participantId) => participantId !== userId);
  if (!otherUserId) return false;
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { userId, blockedUserId: otherUserId },
        { userId: otherUserId, blockedUserId: userId },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
};

const relayToParticipants = (req, participantIds, event, payload) => {
  const io = req.app.get("io");
  participantIds.forEach((userId) => {
    io.to(`user_${userId}`).emit(event, payload);
  });
};

const notifyInactiveParticipants = async (req, participantIds, message) => {
  const io = req.app.get("io");
  const activeSockets = await io
    .in(`conversation_${message.conversationId}`)
    .fetchSockets();
  const activeUserIds = new Set(activeSockets.map((socket) => socket.userId));
  const recipientIds = participantIds.filter(
    (userId) => userId !== message.senderId && !activeUserIds.has(userId)
  );
  await sendMessagePush({
    recipientIds,
    conversationId: message.conversationId,
    message,
  });
};

const optimizeImage = async (filename) => {
  const filepath = path.join(uploadDirectory, filename);
  const optimizedFilename = `${filename}.webp`;
  await sharp(filepath)
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(uploadDirectory, optimizedFilename));
  await fs.unlink(filepath).catch(() => {});
  return optimizedFilename;
};

const cleanupUploadedFiles = async (files) => {
  await Promise.all(
    (files || []).map((file) => fs.unlink(file.path).catch(() => {}))
  );
};

// Deletes an uploaded media file referenced by a "/uploads/<filename>" URL.
const deleteMediaByUrl = async (url) => {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  await fs.unlink(path.join(uploadDirectory, filename)).catch(() => {});
};

const serializeMessage = (message) => ({
  id: message.id,
  clientMessageId: message.clientMessageId,
  conversationId: message.conversationId,
  senderId: message.senderId,
  sender: message.sender,
  content: message.content,
  messageType: message.messageType,
  mediaUrl: message.mediaUrl,
  thumbnailUrl: message.thumbnailUrl,
  duration: message.duration,
  width: message.width,
  height: message.height,
  fileName: message.fileName,
  fileSize: message.fileSize,
  replyToId: message.replyToId,
  replyTo: message.replyTo
    ? {
        id: message.replyTo.id,
        senderId: message.replyTo.senderId,
        sender: message.replyTo.sender,
        content: message.replyTo.deletedAt ? null : message.replyTo.content,
        messageType: message.replyTo.messageType,
        isDeleted: !!message.replyTo.deletedAt,
      }
    : null,
  reactions: message.reactions || [],
  isEdited: !!message.editedAt,
  editedAt: message.editedAt,
  deletedAt: message.deletedAt,
  createdAt: message.createdAt,
});

const touchConversation = (conversationId, timestamp) =>
  prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: timestamp },
  });

router.get("/:conversationId", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const participantIds = await getParticipantIds(conversationId, req.userId);

    if (!participantIds) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const { before } = req.query;

    if (before != null && typeof before !== "string") {
      return res.status(400).json({ error: "Invalid pagination cursor" });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    console.error("Error fetching message history:", error);
    res.status(500).json({ error: "Failed to fetch message history" });
  }
});

router.post("/:conversationId/text", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (
      typeof req.body.content !== "string" ||
      (req.body.replyToId != null && typeof req.body.replyToId !== "string") ||
      (req.body.clientMessageId != null && typeof req.body.clientMessageId !== "string")
    ) {
      return res.status(400).json({ error: "Invalid message content" });
    }
    const content = req.body.content.trim();
    const clientMessageId = req.body.clientMessageId?.trim() || null;

    if (
      !content ||
      content.length > 10000 ||
      req.body.replyToId?.length > 100 ||
      (clientMessageId && !/^[a-zA-Z0-9_-]{16,100}$/.test(clientMessageId))
    ) {
      return res.status(400).json({ error: "Invalid message content" });
    }

    const participantIds = await getParticipantIds(conversationId, req.userId);
    if (!participantIds) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (await isDirectConversationBlocked(conversationId, req.userId, participantIds)) {
      return res.status(403).json({ error: "Direct communication is unavailable" });
    }

    if (clientMessageId) {
      const existing = await prisma.message.findUnique({
        where: {
          senderId_clientMessageId: { senderId: req.userId, clientMessageId },
        },
        include: MESSAGE_INCLUDE,
      });
      if (existing) {
        if (
          existing.conversationId !== conversationId ||
          existing.content !== content ||
          existing.replyToId !== (req.body.replyToId || null)
        ) {
          return res.status(409).json({ error: "Message identifier conflict" });
        }
        return res.json(serializeMessage(existing));
      }
    }

    if (req.body.replyToId) {
      const replyTarget = await prisma.message.findFirst({
        where: { id: req.body.replyToId, conversationId },
        select: { id: true },
      });
      if (!replyTarget) {
        return res.status(400).json({ error: "Reply target not found" });
      }
    }

    let created;
    try {
      created = await prisma.message.create({
        data: {
          conversationId,
          senderId: req.userId,
          clientMessageId,
          content,
          messageType: "TEXT",
          replyToId: req.body.replyToId || null,
        },
        include: MESSAGE_INCLUDE,
      });
    } catch (error) {
      if (error.code !== "P2002" || !clientMessageId) throw error;
      const existing = await prisma.message.findUnique({
        where: {
          senderId_clientMessageId: { senderId: req.userId, clientMessageId },
        },
        include: MESSAGE_INCLUDE,
      });
      if (
        !existing ||
        existing.conversationId !== conversationId ||
        existing.content !== content ||
        existing.replyToId !== (req.body.replyToId || null)
      ) {
        return res.status(409).json({ error: "Message identifier conflict" });
      }
      return res.json(serializeMessage(existing));
    }

    if (!created.sender) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    await touchConversation(conversationId, created.createdAt);

    const message = serializeMessage(created);
    relayToParticipants(req, participantIds, "new_message", message);
    notifyInactiveParticipants(req, participantIds, message).catch((error) =>
      console.error("Unable to send message push:", error)
    );
    res.status(201).json(message);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post(
  "/:conversationId/media",
  authMiddleware,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  async (req, res) => {
    const uploadedFiles = [
      ...(req.files?.file || []),
      ...(req.files?.thumbnail || []),
    ];
    try {
      const { conversationId } = req.params;
      const file = req.files?.file?.[0];
      const thumbnailFile = req.files?.thumbnail?.[0];
      const messageType = req.body.messageType;

      if (!file || !MEDIA_TYPES.has(messageType)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: "Invalid media upload" });
      }

      const duration =
        req.body.duration != null && req.body.duration !== ""
          ? Number(req.body.duration)
          : null;
      const width =
        req.body.width != null && req.body.width !== ""
          ? Number(req.body.width)
          : null;
      const height =
        req.body.height != null && req.body.height !== ""
          ? Number(req.body.height)
          : null;
      const fileName = messageType === "FILE"
        ? path.basename(file.originalname || "file")
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 191) || "file"
        : null;

      if (
        (duration != null &&
          (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_MS)) ||
        (width != null && (!Number.isFinite(width) || width <= 0 || width > 20000)) ||
        (height != null && (!Number.isFinite(height) || height <= 0 || height > 20000)) ||
        (req.body.replyToId != null &&
          (typeof req.body.replyToId !== "string" || req.body.replyToId.length > 100))
      ) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: "Invalid media metadata" });
      }

      const participantIds = await getParticipantIds(conversationId, req.userId);
      if (!participantIds) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(403).json({ error: "Not authorized" });
      }
      if (await isDirectConversationBlocked(conversationId, req.userId, participantIds)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(403).json({ error: "Direct communication is unavailable" });
      }

      if (req.body.replyToId) {
        const replyTarget = await prisma.message.findFirst({
          where: { id: req.body.replyToId, conversationId },
          select: { id: true },
        });
        if (!replyTarget) {
          await cleanupUploadedFiles(uploadedFiles);
          return res.status(400).json({ error: "Reply target not found" });
        }
      }

      let mediaFilename;
      if (messageType === "IMAGE" || messageType === "DRAWING") {
        mediaFilename = await optimizeImage(file.filename);
      } else {
        mediaFilename = file.filename;
      }

      let thumbnailFilename = null;
      if (thumbnailFile) {
        thumbnailFilename = await optimizeImage(thumbnailFile.filename);
      }

      const created = await prisma.message.create({
        data: {
          conversationId,
          senderId: req.userId,
          content: null,
          messageType,
          mediaUrl: `/uploads/${mediaFilename}`,
          thumbnailUrl: thumbnailFilename ? `/uploads/${thumbnailFilename}` : null,
          duration,
          width,
          height,
          fileName,
          fileSize: messageType === "FILE" ? file.size : null,
          replyToId: req.body.replyToId || null,
        },
        include: MESSAGE_INCLUDE,
      });

      if (!created.sender) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      await touchConversation(conversationId, created.createdAt);

      const message = serializeMessage(created);
      relayToParticipants(req, participantIds, "new_message", message);
      notifyInactiveParticipants(req, participantIds, message).catch((error) =>
        console.error("Unable to send message push:", error)
      );
      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending media message:", error);
      await cleanupUploadedFiles(uploadedFiles);
      res.status(500).json({ error: "Failed to send media message" });
    }
  }
);

router.post("/:conversationId/:messageId/react", authMiddleware, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    if (
      typeof req.body.emoji !== "string" ||
      !req.body.emoji.trim() ||
      req.body.emoji.length > 16
    ) {
      return res.status(400).json({ error: "Invalid reaction" });
    }
    const emoji = req.body.emoji.trim();

    const participantIds = await getParticipantIds(conversationId, req.userId);
    if (!participantIds) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const target = await prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true },
    });
    if (!target) {
      return res.status(404).json({ error: "Message not found" });
    }

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: req.userId, emoji } },
    });

    let action;
    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      action = "removed";
    } else {
      await prisma.messageReaction.create({
        data: { messageId, userId: req.userId, emoji },
      });
      action = "added";
    }

    const operation = {
      conversationId,
      messageId,
      actorId: req.userId,
      emoji,
      action,
      createdAt: new Date().toISOString(),
    };
    relayToParticipants(req, participantIds, "message_reacted", operation);
    res.status(201).json(operation);
  } catch (error) {
    console.error("Error toggling reaction:", error);
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

router.put("/:conversationId/:messageId", authMiddleware, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    if (typeof req.body.content !== "string") {
      return res.status(400).json({ error: "Invalid message content" });
    }
    const content = req.body.content.trim();
    if (!content || content.length > 10000) {
      return res.status(400).json({ error: "Invalid message content" });
    }

    const participantIds = await getParticipantIds(conversationId, req.userId);
    if (!participantIds) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const existing = await prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, senderId: true, deletedAt: true, messageType: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (existing.senderId !== req.userId) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }
    if (existing.deletedAt) {
      return res.status(400).json({ error: "Cannot edit a deleted message" });
    }
    if (existing.messageType !== "TEXT") {
      return res.status(400).json({ error: "Only text messages can be edited" });
    }

    const editedAt = new Date();
    await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt },
    });

    const operation = {
      conversationId,
      messageId,
      actorId: req.userId,
      content,
      editedAt: editedAt.toISOString(),
    };
    relayToParticipants(req, participantIds, "message_edited", operation);
    res.json(operation);
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

router.delete("/:conversationId/:messageId", authMiddleware, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const participantIds = await getParticipantIds(conversationId, req.userId);
    if (!participantIds) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const existing = await prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, senderId: true, deletedAt: true, mediaUrl: true, thumbnailUrl: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (existing.senderId !== req.userId) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }
    if (existing.deletedAt) {
      return res.json({ success: true });
    }

    const deletedAt = new Date();
    await prisma.message.update({
      where: { id: messageId },
      data: { content: null, mediaUrl: null, thumbnailUrl: null, deletedAt },
    });

    await Promise.all([
      deleteMediaByUrl(existing.mediaUrl),
      deleteMediaByUrl(existing.thumbnailUrl),
    ]);

    const operation = {
      conversationId,
      messageId,
      actorId: req.userId,
      deletedAt: deletedAt.toISOString(),
    };
    relayToParticipants(req, participantIds, "message_deleted", operation);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

module.exports = router;
