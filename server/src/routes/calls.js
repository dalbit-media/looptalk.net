const crypto = require("crypto");
const express = require("express");
const auth = require("../middleware/auth");

const router = express.Router();
const CREDENTIAL_TTL_SECONDS = 10 * 60;

router.get("/ice-servers", auth, (req, res) => {
  const urls = process.env.TURN_URLS?.split(",").map((url) => url.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET?.trim();
  if (!urls?.length || !secret) {
    return res.json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:${req.userId}`;
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
  res.set("Cache-Control", "private, no-store");
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls, username, credential },
    ],
    expiresAt,
  });
});

module.exports = router;