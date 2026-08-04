const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");
const { getLinkPreview } = require("../utils/contentParser");

const router = express.Router();

// Get link preview
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;

    if (typeof url !== "string" || !url.trim() || url.length > 2048) {
      return res.status(400).json({ error: "URL required" });
    }

    const preview = await getLinkPreview(url.trim());
    res.json(preview);
  } catch (error) {
    console.error("Error fetching link preview:", error);
    res.status(500).json({ error: "Failed to fetch preview" });
  }
});

module.exports = router;
