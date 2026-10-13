const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// Search users (must be declared before the dynamic /:id route)
router.get("/search", authMiddleware, async (req, res) => {
  try {
    if (typeof req.query.q !== "string") return res.json([]);
    const query = req.query.q.trim();

    if (query.length < 2) return res.json([]);
    if (query.length > 100) {
      return res.status(400).json({ error: "Search query is too long" });
    }

    const userSelect = {
      id: true,
      username: true,
      displayName: true,
      profilePicture: true,
    };
    const visibilityFilter = {
      id: { not: req.userId },
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
    if (exactIdMatch) return res.json([exactIdMatch]);

    const users = await prisma.user.findMany({
      where: {
        ...visibilityFilter,
        OR: [
          { username: { contains: query } },
          { displayName: { contains: query } },
        ],
      },
      select: userSelect,
      take: 20,
    });

    res.json(users);
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
        displayName: true,
        profilePicture: true,
        bio: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update profile
router.put("/", authMiddleware, async (req, res) => {
  try {
    const { username, displayName, bio, profilePicture } = req.body;

    if ([username, displayName, bio, profilePicture].some(
      (value) => value !== undefined && typeof value !== "string"
    )) {
      return res.status(400).json({ error: "Invalid profile data" });
    }

    const normalizedUsername = typeof username === "string" ? username.trim() : undefined;
    const normalizedDisplayName = typeof displayName === "string" ? displayName.trim() : undefined;
    const normalizedBio = typeof bio === "string" ? bio.trim() : undefined;

    if (normalizedUsername !== undefined && !/^[a-zA-Z0-9_]{3,24}$/.test(normalizedUsername)) {
      return res.status(400).json({ error: "Invalid username" });
    }
    if (normalizedDisplayName !== undefined && !normalizedDisplayName) {
      return res.status(400).json({ error: "Display name is required" });
    }
    if (normalizedDisplayName?.length > 100 || normalizedBio?.length > 500) {
      return res.status(400).json({ error: "Profile data is too long" });
    }
    if (profilePicture?.trim().length > 2048) {
      return res.status(400).json({ error: "Profile picture URL is too long" });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        username: normalizedUsername || undefined,
        displayName: normalizedDisplayName || undefined,
        bio: normalizedBio === undefined ? undefined : normalizedBio,
        profilePicture: profilePicture?.trim() || undefined,
      },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        profilePicture: true,
        bio: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Username already exists" });
    }
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Block user
router.post("/:userId/block", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    await prisma.block.create({
      data: {
        userId: req.userId,
        blockedUserId: userId,
      },
    }).catch(() => {
      // Already blocked
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
