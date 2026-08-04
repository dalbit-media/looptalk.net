const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const CONTACT_GROUPS = new Set([
  "Family 1", "Family 2", "All Contacts 1", "All Contacts 2", "Work 1", "Work 2",
  "Project 1", "Project 2", "School 1", "School 2", "Class 1", "Class 2",
]);

// Get contacts grouped by group name
router.get("/", authMiddleware, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: req.userId },
      include: {
        contactUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profilePicture: true,
            status: true,
          },
        },
      },
      orderBy: [{ groupName: "asc" }, { nickname: "asc" }],
    });

    // Group contacts by groupName
    const grouped = {};
    contacts.forEach((contact) => {
      if (!grouped[contact.groupName]) {
        grouped[contact.groupName] = [];
      }
      grouped[contact.groupName].push(contact);
    });

    res.json(grouped);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Get single contact
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: {
        userId: req.userId,
        contactUserId: req.params.id,
      },
      include: {
        contactUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profilePicture: true,
            bio: true,
            status: true,
          },
        },
      },
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json(contact);
  } catch (error) {
    console.error("Error fetching contact:", error);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

// Add contact
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { contactUserId, groupName, nickname } = req.body;
    if (
      typeof contactUserId !== "string" ||
      typeof groupName !== "string" ||
      (nickname != null && typeof nickname !== "string")
    ) {
      return res.status(400).json({ error: "Invalid contact data" });
    }
    const normalizedNickname = nickname?.trim() || null;
    if (!CONTACT_GROUPS.has(groupName) || (normalizedNickname?.length || 0) > 50) {
      return res.status(400).json({ error: "Invalid contact data" });
    }
    if (contactUserId === req.userId) {
      return res.status(400).json({ error: "Cannot add yourself as a contact" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: contactUserId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already a contact
    const existing = await prisma.contact.findFirst({
      where: {
        userId: req.userId,
        contactUserId,
      },
    });

    if (existing) {
      return res.status(400).json({ error: "Already a contact" });
    }

    const contact = await prisma.contact.create({
      data: {
        userId: req.userId,
        contactUserId,
        groupName,
        nickname: normalizedNickname,
      },
      include: {
        contactUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profilePicture: true,
          },
        },
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error("Error adding contact:", error);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

// Update contact
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { groupName, nickname, isFavorite } = req.body;
    if (
      (groupName !== undefined && (
        typeof groupName !== "string" || !CONTACT_GROUPS.has(groupName)
      )) ||
      (nickname !== undefined && typeof nickname !== "string") ||
      (isFavorite !== undefined && typeof isFavorite !== "boolean")
    ) {
      return res.status(400).json({ error: "Invalid contact data" });
    }
    const normalizedNickname = nickname?.trim();
    if (normalizedNickname && normalizedNickname.length > 50) {
      return res.status(400).json({ error: "Nickname is too long" });
    }

    const contact = await prisma.contact.updateMany({
      where: {
        userId: req.userId,
        contactUserId: req.params.id,
      },
      data: {
        groupName,
        nickname: nickname === undefined ? undefined : normalizedNickname || null,
        isFavorite,
      },
    });

    if (contact.count === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating contact:", error);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// Delete contact
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.deleteMany({
      where: {
        userId: req.userId,
        contactUserId: req.params.id,
      },
    });

    if (contact.count === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

module.exports = router;
