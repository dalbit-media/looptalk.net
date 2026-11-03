const express = require("express");

// Must match the artifact names configured in desktop/package.json.
const DESKTOP_INSTALLERS = {
  windows: "LoopTalk-Setup.exe",
  mac: "LoopTalk.dmg",
  linux: "LoopTalk.AppImage",
  "linux-deb": "LoopTalk.deb",
};
// Desktop users run the web app in their browser; installers are offered only when a host is configured.
const WEB_APP_PATH = "/app/";

const resolveBaseUrl = (value) => {
  if (!value) return null;
  const url = new URL(value);
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
    res.redirect(302, base ? `${base}/${installer}` : WEB_APP_PATH);
  });
  return router;
};

module.exports = { createDesktopDownloadRouter, DESKTOP_INSTALLERS };
