const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const GROUP_MANAGERS = new Set(["OWNER", "ADMIN"]);

const PARTICIPANT_INCLUDE = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          profilePicture: true,
        },
      },
    },
  },
};

const LAST_MESSAGE_INCLUDE = {
  messages: {
    take: 1,
    orderBy: { createdAt: "desc" },
    include: {
      sender: {
        select: { id: true, username: true, displayName: true, profilePicture: true },
      },
    },
  },
};

const relayConversationUpdate = (req, conversation) => {
  const io = req.app.get("io");
  conversation.participants.forEach((participant) => {
    io.to(`user_${participant.userId}`).emit("conversation_updated", conversation);
  });
};

// Get conversations list
router.get("/", authMiddleware, async (req, res) => {
  try {
    const conversations = await prisma.conversationParticipant.findMany({
      where: { userId: req.userId },
      include: {
        conversation: {
          include: { ...PARTICIPANT_INCLUDE, ...LAST_MESSAGE_INCLUDE },
        },
      },
      orderBy: { conversation: { createdAt: "desc" } },
    });

    const result = await Promise.all(
      conversations.map(async (cp) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: cp.conversationId,
            senderId: { not: req.userId },
            deletedAt: null,
            createdAt: { gt: cp.lastReadAt || new Date(0) },
          },
        });
        return { ...cp.conversation, unreadCount };
      })
    );

    result.sort(
      (left, right) =>
        new Date(right.lastMessageAt || right.createdAt) -
        new Date(left.lastMessageAt || left.createdAt)
    );

    res.json(result);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Get or create 1-to-1 conversation
router.post("/direct/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      return res.status(400).json({ error: "Cannot start a conversation with yourself" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { userId: req.userId, blockedUserId: userId },
          { userId, blockedUserId: req.userId },
        ],
      },
      select: { id: true },
    });
    if (block) {
      return res.status(403).json({ error: "Direct communication is unavailable" });
    }

    // Find existing 1-to-1 conversation shared by exactly these two users
    let conversation = await prisma.conversation.findFirst({
      where: {
        isGroupChat: false,
        participants: {
          some: { userId: req.userId },
          every: { userId: { in: [req.userId, userId] } },
        },
      },
      include: PARTICIPANT_INCLUDE,
    });

    if (conversation) {
      return res.json(conversation);
    }

    // Create new conversation
    conversation = await prisma.conversation.create({
      data: {
        isGroupChat: false,
        participants: {
          create: [
            { userId: req.userId },
            { userId },
          ],
        },
      },
      include: PARTICIPANT_INCLUDE,
    });

    res.status(201).json(conversation);
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get conversation detail with messages
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: PARTICIPANT_INCLUDE,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(
      (p) => p.userId === req.userId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Mark as read
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    res.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

router.post("/:id/read", authMiddleware, async (req, res) => {
  try {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      select: { id: true },
    });
    if (!participant) return res.status(403).json({ error: "Not authorized" });

    const lastReadAt = new Date();
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt },
    });
    res.json({ conversationId: req.params.id, lastReadAt });
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    res.status(500).json({ error: "Failed to mark conversation as read" });
  }
});

// Create group conversation
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, userIds } = req.body;

    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((id) => typeof id === "string")
    ) {
      return res.status(400).json({ error: "At least one participant is required" });
    }
    if (name != null && (typeof name !== "string" || name.trim().length > 100)) {
      return res.status(400).json({ error: "Invalid conversation name" });
    }

    // De-duplicate and exclude the creator (added separately below)
    const memberIds = [...new Set(userIds.filter((id) => id !== req.userId))];
    if (memberIds.length === 0) {
      return res.status(400).json({ error: "At least one other participant is required" });
    }

    // Validate users exist
    const users = await prisma.user.findMany({
      where: { id: { in: memberIds } },
    });

    if (users.length !== memberIds.length) {
      return res.status(400).json({ error: "One or more users not found" });
    }

    const conversation = await prisma.conversation.create({
      data: {
        name: name?.trim() || null,
        isGroupChat: true,
        participants: {
          create: [
            { userId: req.userId, role: "OWNER" },
            ...memberIds.map((userId) => ({ userId })),
          ],
        },
      },
      include: PARTICIPANT_INCLUDE,
    });

    res.status(201).json(conversation);
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

// Rename a group conversation
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: "Invalid conversation name" });
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      include: { conversation: { select: { isGroupChat: true } } },
    });
    if (!participant) return res.status(403).json({ error: "Not authorized" });
    if (!participant.conversation.isGroupChat) {
      return res.status(400).json({ error: "Only group conversations can be renamed" });
    }
    if (!GROUP_MANAGERS.has(participant.role)) {
      return res.status(403).json({ error: "Group management permission required" });
    }

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
      include: PARTICIPANT_INCLUDE,
    });
    relayConversationUpdate(req, conversation);
    res.json(conversation);
  } catch (error) {
    console.error("Error renaming group:", error);
    res.status(500).json({ error: "Failed to rename group" });
  }
});

// Add a member to an existing group conversation
router.post("/:id/members", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (typeof userId !== "string" || !userId || userId === req.userId) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      include: { conversation: { select: { isGroupChat: true } } },
    });
    if (!participant) return res.status(403).json({ error: "Not authorized" });
    if (!participant.conversation.isGroupChat) {
      return res.status(400).json({ error: "Members can only be added to groups" });
    }
    if (!GROUP_MANAGERS.has(participant.role)) {
      return res.status(403).json({ error: "Group management permission required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId,
        },
      },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: "User is already a member" });

    await prisma.conversationParticipant.create({
      data: { conversationId: req.params.id, userId },
    });
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: PARTICIPANT_INCLUDE,
    });
    relayConversationUpdate(req, conversation);
    res.status(201).json(conversation);
  } catch (error) {
    console.error("Error adding group member:", error);
    res.status(500).json({ error: "Failed to add group member" });
  }
});

// Promote or demote a group administrator (owner only)
router.patch("/:id/members/:userId", authMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    if (!new Set(["ADMIN", "MEMBER"]).has(role)) {
      return res.status(400).json({ error: "Invalid group role" });
    }
    const requester = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      include: { conversation: { select: { isGroupChat: true } } },
    });
    if (!requester || !requester.conversation.isGroupChat) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (requester.role !== "OWNER") {
      return res.status(403).json({ error: "Only the group owner can change roles" });
    }
    const target = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.params.userId,
        },
      },
    });
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target.role === "OWNER") {
      return res.status(400).json({ error: "The owner role cannot be changed" });
    }

    await prisma.conversationParticipant.update({
      where: { id: target.id },
      data: { role },
    });
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: PARTICIPANT_INCLUDE,
    });
    relayConversationUpdate(req, conversation);
    res.json(conversation);
  } catch (error) {
    console.error("Error changing group role:", error);
    res.status(500).json({ error: "Failed to change group role" });
  }
});

// Remove a member from a group
router.delete("/:id/members/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.params.userId === req.userId) {
      return res.status(400).json({ error: "Use leave group to remove yourself" });
    }
    const [requester, target] = await Promise.all([
      prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: req.params.id,
            userId: req.userId,
          },
        },
        include: { conversation: { select: { isGroupChat: true } } },
      }),
      prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: req.params.id,
            userId: req.params.userId,
          },
        },
      }),
    ]);
    if (!requester || !requester.conversation.isGroupChat) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (!GROUP_MANAGERS.has(requester.role)) {
      return res.status(403).json({ error: "Group management permission required" });
    }
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target.role === "OWNER" || (requester.role === "ADMIN" && target.role !== "MEMBER")) {
      return res.status(403).json({ error: "You cannot remove this member" });
    }

    await prisma.conversationParticipant.delete({ where: { id: target.id } });
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: PARTICIPANT_INCLUDE,
    });
    relayConversationUpdate(req, conversation);
    req.app.get("io").to(`user_${target.userId}`).emit("conversation_removed", {
      conversationId: req.params.id,
    });
    res.json(conversation);
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ error: "Failed to remove group member" });
  }
});

// Leave conversation
router.post("/:id/leave", authMiddleware, async (req, res) => {
  try {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.userId,
        },
      },
      include: {
        conversation: {
          select: {
            isGroupChat: true,
            participants: { orderBy: [{ joinedAt: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    if (!participant) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (!participant.conversation.isGroupChat) {
      return res.status(400).json({ error: "Only group conversations can be left" });
    }

    const remaining = participant.conversation.participants.filter(
      (member) => member.userId !== req.userId
    );
    if (remaining.length === 0) {
      await prisma.conversation.delete({ where: { id: req.params.id } });
    } else {
      await prisma.$transaction(async (transaction) => {
        if (participant.role === "OWNER") {
          const successor = remaining.find((member) => member.role === "ADMIN") || remaining[0];
          await transaction.conversationParticipant.update({
            where: { id: successor.id },
            data: { role: "OWNER" },
          });
        }
        await transaction.conversationParticipant.delete({ where: { id: participant.id } });
      });
      const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: PARTICIPANT_INCLUDE,
      });
      relayConversationUpdate(req, conversation);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error leaving conversation:", error);
    res.status(500).json({ error: "Failed to leave conversation" });
  }
});

module.exports = router;

