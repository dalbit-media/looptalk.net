const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const settingsFile = () => path.join(app.getPath("userData"), "desktop-settings.json");

const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
};

const updateSettings = (changes) => {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...changes }, null, 2));
};

module.exports = { readSettings, updateSettings };
