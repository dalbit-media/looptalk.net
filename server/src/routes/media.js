const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const { uploadDirectory } = require("../utils/uploadStorage");

const router = express.Router();

const IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// Profile pictures must be images; reuse the shared disk storage/filename
// strategy but reject video/audio uploads that the generic upload
// middleware otherwise allows for chat media.
const profilePictureUpload = multer({
  storage: upload.storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Profile picture must be an image"));
    }
  },
});

// Upload profile picture
router.post(
  "/profile-picture",
  authMiddleware,
  profilePictureUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const filename = req.file.filename;
      const filepath = path.join(uploadDirectory, filename);
      const optimizedFilename = `${filename}.webp`;

      // Optimize image
      await sharp(filepath)
        .rotate()
        .resize(500, 500, { fit: "cover" })
        .webp({ quality: 85 })
        .toFile(path.join(uploadDirectory, optimizedFilename));

      // Delete original
      await fs.unlink(filepath).catch(() => {});

      res.json({
        url: `/uploads/${optimizedFilename}`,
      });
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      res.status(500).json({ error: "Failed to upload profile picture" });
    }
  }
);

module.exports = router;

