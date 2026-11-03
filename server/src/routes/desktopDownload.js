const express = require("express");

const DEFAULT_DOWNLOAD_BASE_URL = "https://github.com/dalbit-media/looptalk.net/releases/latest/download";
// Must match the artifact names configured in desktop/package.json.
const DESKTOP_INSTALLERS = {
  windows: "LoopTalk-Setup.exe",
  mac: "LoopTalk.dmg",
  linux: "LoopTalk.AppImage",
  "linux-deb": "LoopTalk.deb",
};

const resolveBaseUrl = (value) => {
  const url = new URL(value || DEFAULT_DOWNLOAD_BASE_URL);
  if (url.protocol !== "https:") throw new Error("DESKTOP_DOWNLOAD_BASE_URL must use HTTPS");
  return url.href.replace(/\/+$/, "");
};

const createDesktopDownloadRouter = ({ baseUrl = process.env.DESKTOP_DOWNLOAD_BASE_URL } = {}) => {
  const base = resolveBaseUrl(baseUrl);
  const router = express.Router();
  router.get("/:platform", (req, res) => {
    const installer = Object.hasOwn(DESKTOP_INSTALLERS, req.params.platform)
      ? DESKTOP_INSTALLERS[req.params.platform]
      : null;
    if (!installer) return res.status(404).json({ error: "Unknown desktop platform" });
    res.set("Cache-Control", "no-store");
    res.redirect(302, `${base}/${installer}`);
  });
  return router;
};

module.exports = { createDesktopDownloadRouter, DESKTOP_INSTALLERS };
