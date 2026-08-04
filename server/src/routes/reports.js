const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const REPORT_CATEGORIES = new Set([
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL_CONTENT",
  "VIOLENCE",
  "ILLEGAL_ACTIVITY",
  "IMPERSONATION",
  "OTHER",
]);
const REPORT_STATUSES = new Set(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);
const requireReportAdmin = (req, res, next) => {
  const adminIds = new Set(
    (process.env.ADMIN_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean)
  );
  if (!adminIds.has(req.userId)) {
    return res.status(403).json({ error: "Administrator access is required" });
  }
  next();
};

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { reportedUserId, messageId, category, details } = req.body || {};
    if ((!reportedUserId && !messageId) || !REPORT_CATEGORIES.has(category)) {
      return res.status(400).json({ error: "A report target and valid category are required" });
    }
    if (details != null && (typeof details !== "string" || details.trim().length > 1000)) {
      return res.status(400).json({ error: "Report details must be 1000 characters or fewer" });
    }

    let subjectId = reportedUserId || null;
    let contentSnapshot = null;
    if (messageId) {
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversation: { participants: { some: { userId: req.userId } } },
        },
        select: {
          senderId: true,
          content: true,
          messageType: true,
          mediaUrl: true,
          fileName: true,
          createdAt: true,
        },
      });
      if (!message) return res.status(404).json({ error: "Message not found" });
      subjectId = message.senderId;
      contentSnapshot = JSON.stringify(message);
    } else {
      const subject = await prisma.user.findUnique({
        where: { id: subjectId },
        select: { id: true, username: true, displayName: true, bio: true },
      });
      if (!subject) return res.status(404).json({ error: "User not found" });
      contentSnapshot = JSON.stringify(subject);
    }

    if (subjectId === req.userId) {
      return res.status(400).json({ error: "You cannot report yourself" });
    }

    const recentDuplicate = await prisma.report.findFirst({
      where: {
        reporterId: req.userId,
        reportedUserId: subjectId,
        messageId: messageId || null,
        category,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentDuplicate) {
      return res.status(409).json({ error: "This report was already submitted" });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: req.userId,
        reportedUserId: subjectId,
        messageId: messageId || null,
        category,
        details: details?.trim() || null,
        contentSnapshot,
      },
      select: { id: true, status: true, createdAt: true },
    });
    res.status(201).json(report);
  } catch (error) {
    console.error("Report submission error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

router.get("/", authMiddleware, requireReportAdmin, async (req, res) => {
  try {
    const status = req.query.status || "OPEN";
    if (!REPORT_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid report status" });
    }
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || "50", 10) || 50, 1), 100);
    const reports = await prisma.report.findMany({
      where: { status },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        reportedUser: { select: { id: true, username: true, displayName: true } },
      },
    });
    res.json(reports);
  } catch (error) {
    console.error("Report list error:", error);
    res.status(500).json({ error: "Failed to load reports" });
  }
});

router.patch("/:id", authMiddleware, requireReportAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!REPORT_STATUSES.has(status) || status === "OPEN") {
      return res.status(400).json({ error: "Invalid review status" });
    }
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        status,
        reviewedAt: status === "REVIEWING" ? null : new Date(),
      },
      select: { id: true, status: true, reviewedAt: true },
    });
    res.json(report);
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Report not found" });
    console.error("Report review error:", error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

module.exports = router;
