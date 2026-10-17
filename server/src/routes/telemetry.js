const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/web-app-install", authMiddleware, async (req, res) => {
  const installationId = req.body?.installationId;
  if (
    typeof installationId !== "string" ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(installationId)
  ) {
    return res.status(400).json({ error: "Invalid installation identifier" });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }, select: { id: true },
    });
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    await prisma.webAppInstallation.upsert({
      where: { installationId },
      update: {},
      create: { installationId },
    });
    res.set("Cache-Control", "no-store");
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording web app installation:", error);
    res.status(500).json({ error: "Failed to record web app installation" });
  }
});

module.exports = router;
