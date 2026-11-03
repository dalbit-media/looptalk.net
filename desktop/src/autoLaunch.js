const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { linuxAutostartEntry } = require("./policy");
const { readSettings, updateSettings } = require("./settings");

const HIDDEN_ARG = "--hidden";
const linuxAutostartFile = () => path.join(app.getPath("appData"), "autostart", "looptalk.desktop");
// AppImage runs from a temporary mount; autostart must point at the AppImage file itself.
const executablePath = () => process.env.APPIMAGE || process.execPath;
const loginItemQuery = () => (process.platform === "win32" ? { path: executablePath(), args: [HIDDEN_ARG] } : {});

const isAutoLaunchEnabled = () => {
  if (process.platform === "linux") return fs.existsSync(linuxAutostartFile());
  return app.getLoginItemSettings(loginItemQuery()).openAtLogin;
};

const setAutoLaunch = (enabled) => {
  // Development runs would register the bare Electron binary instead of LoopTalk.
  if (!app.isPackaged) return;
  if (process.platform === "linux") {
    const file = linuxAutostartFile();
    if (enabled) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, linuxAutostartEntry({
        name: app.getName(), execPath: executablePath(), args: [HIDDEN_ARG],
      }));
    } else {
      fs.rmSync(file, { force: true });
    }
  } else {
    app.setLoginItemSettings({
      ...loginItemQuery(),
      openAtLogin: enabled,
      openAsHidden: true,
    });
  }
  updateSettings({ autoLaunch: enabled });
};

// Start at login is on by default; afterwards the user's tray choice is respected.
const initializeAutoLaunch = () => {
  if (!app.isPackaged || typeof readSettings().autoLaunch === "boolean") return;
  try {
    setAutoLaunch(true);
  } catch (error) {
    console.error("Could not enable LoopTalk at login:", error);
  }
};

const wasLaunchedAtLogin = () =>
  process.argv.includes(HIDDEN_ARG) ||
  (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin === true);

module.exports = { initializeAutoLaunch, isAutoLaunchEnabled, setAutoLaunch, wasLaunchedAtLogin };
