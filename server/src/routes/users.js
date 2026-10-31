const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");
const requireMember = require("../middleware/requireMember");
const { secureTransaction } = require("../utils/secureRelay");

const router = express.Router();
const { validVault, validDisplayName, upgradeRequired, onlyFields, opaqueUser } = require("../utils/privateAccounts");

router.get("/vault", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.authPublicKey) return upgradeRequired(res);
  return res.json({ vault: JSON.parse(user.encryptedVault), revision: user.vaultRevision });
});
const updateOwner = async (req, res) => {
  if (!onlyFields(req.body, ["username", "displayName", "vault", "expectedRevision"])) return upgradeRequired(res);
  const username = req.body.username;
  const displayName = req.body.displayName;
  if (displayName !== undefined && !validDisplayName(displayName)) {
    return res.status(400).json({ error: "Display name must contain 1–100 characters without control characters" });
  }
  if (username !== undefined && (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,24}$/.test(username))) {
    return res.status(400).json({ error: "Public username must contain 3–24 ASCII letters, digits or underscores" });
  }
  const { vault, expectedRevision } = req.body;
  const updatesVault = vault !== undefined || expectedRevision !== undefined;
  if ((!updatesVault && username === undefined && displayName === undefined) || (updatesVault &&
      (!validVault(vault) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      expectedRevision >= 2147483647))) return res.status(400).json({ error: "Invalid vault update" });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { authPublicKey: true } });
  if (!user?.authPublicKey) return upgradeRequired(res);
  try {
    const result = await prisma.user.updateMany({
      where: { id: req.userId, ...(updatesVault ? { vaultRevision: expectedRevision } : {}) },
      data: {
        ...(username === undefined ? {} : { username: username.toLowerCase(), publicUsername: username.toLowerCase() }),
        ...(displayName === undefined ? {} : { publicDisplayName: displayName.trim() }),
        ...(updatesVault ? { encryptedVault: JSON.stringify(vault), vaultRevision: { increment: 1 } } : {}),
      },
    });
    if (!result.count) return res.status(409).json({ error: "Vault revision conflict", code: "VAULT_CONFLICT" });
    const updated = await prisma.user.findUnique({ where: { id: req.userId } });
    return res.json({
      user: opaqueUser(updated),
      ...(updatesVault ? { vault, revision: expectedRevision + 1 } : {}),
    });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Public username is already reserved", code: "USERNAME_CONFLICT" });
    throw error;
  }
};
router.put("/vault", authMiddleware, (req, res, next) => {
  if (!onlyFields(req.body, ["vault", "expectedRevision"])) return upgradeRequired(res);
  return updateOwner(req, res).catch(next);
});
router.put("/", authMiddleware, updateOwner);

router.post("/profiles", authMiddleware, async (req, res) => {
  const { userIds } = req.body || {};
  if (!onlyFields(req.body, ["userIds"]) || !Array.isArray(userIds) || userIds.length > 200 ||
      userIds.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    return res.status(400).json({ error: "Up to 200 valid user IDs are required" });
  }
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: { not: "SYSTEM" } },
    select: { id: true, publicUsername: true, publicDisplayName: true },
  });
  return res.json(users.map(opaqueUser));
});

// Search users (must be declared before the dynamic /:id route)
router.get("/search", authMiddleware, requireMember, async (req, res) => {
  try {
    if (typeof req.query.q !== "string") return res.json([]);
    const query = req.query.q.trim().replace(/^@/, "");

    if (query.length < 2) return res.json([]);
    if (query.length > 100) {
      return res.status(400).json({ error: "Search query is too long" });
    }

    const userSelect = {
      id: true,
      username: true,
      publicUsername: true,
      publicDisplayName: true,
      displayName: true,
      profilePicture: true,
    };
    const visibilityFilter = {
      id: { not: req.userId },
      status: { not: "SYSTEM" },
      NOT: [
        { blocks: { some: { blockedUserId: req.userId } } },
        { blockedBy: { some: { userId: req.userId } } },
      ],
    };
    const exactIdMatch = query !== req.userId
      ? await prisma.user.findFirst({
          where: { ...visibilityFilter, id: query },
          select: userSelect,
        })
      : null;
    if (exactIdMatch) return res.json([opaqueUser(exactIdMatch)]);

    const users = await prisma.user.findMany({
      where: {
        ...visibilityFilter,
        publicUsername: query.toLowerCase(),
        authPublicKey: { not: null },
      },
      select: userSelect,
      take: 20,
    });

    res.json(users.map(opaqueUser));
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// Get user profile
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        publicUsername: true,
        publicDisplayName: true,
        displayName: true,
        profilePicture: true,
        bio: true,
        status: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(opaqueUser(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Block user
router.post("/:userId/block", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    await secureTransaction(prisma, async (transaction) => {
      await transaction.block.upsert({
        where: { userId_blockedUserId: { userId: req.userId, blockedUserId: userId } },
        create: { userId: req.userId, blockedUserId: userId },
        update: {},
      });
      // Blocking discards pending direct-chat deliveries in both directions.
      // Group deliveries are unaffected, and unblocking never requeues content.
      const conversations = await transaction.conversation.findMany({
        where: {
          kind: "CHAT", isGroupChat: false,
          AND: [
            { participants: { some: { userId: req.userId } } },
            { participants: { some: { userId } } },
          ],
        },
        select: { id: true },
      });
      const dispatch = { conversationId: { in: conversations.map((c) => c.id) } };
      await transaction.secureEnvelope.deleteMany({ where: { dispatch } });
      await transaction.securePayload.deleteMany({ where: { dispatch } });
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ error: "Failed to block user" });
  }
});

// Unblock user
router.post("/:userId/unblock", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    await prisma.block.deleteMany({
      where: {
        userId: req.userId,
        blockedUserId: userId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

module.exports = router;
