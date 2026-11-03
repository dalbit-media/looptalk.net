const path = require("node:path");
const {
  app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, dialog, ipcMain, nativeImage, session, shell,
} = require("electron");
const {
  isAllowedPermission, isAppOrigin, isExternalWebUrl, resolveAppUrl, sanitizeNotification,
} = require("./policy");
const { initializeAutoLaunch, isAutoLaunchEnabled, setAutoLaunch, wasLaunchedAtLogin } = require("./autoLaunch");
const { readSettings, updateSettings } = require("./settings");

const APP_ID = "net.looptalk.desktop";
const RETRY_DELAY_MS = 10_000;
const appUrl = resolveAppUrl(require("../package.json").looptalkUrl, process.env.LOOPTALK_URL);
const iconPath = path.join(__dirname, "..", "assets", "icon.png");
const trayIconPath = path.join(__dirname, "..", "assets", "tray.png");

let mainWindow = null;
let tray = null;
let quitting = false;
let retryTimer = null;
const notifications = new Map();
let pendingNotificationPermission = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Windows only attributes toast notifications to an app with a registered AppUserModelID.
  app.setAppUserModelId(APP_ID);
  app.on("second-instance", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("activate", () => showWindow());
  app.whenReady().then(start);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isTrustedSender(event) {
  return Boolean(event.senderFrame) && isAppOrigin(event.senderFrame.url, appUrl);
}

function loadApp(target = appUrl.href) {
  clearTimeout(retryTimer);
  mainWindow.loadURL(target).catch(() => {});
}

function notificationsAllowed() {
  return Notification.isSupported() && readSettings().notificationPermission === "granted";
}

// Backs the page's Notification.permission and Notification.requestPermission(), so the web client needs no
// desktop-specific permission API. Unlike a browser, a declined choice can be asked again from Settings.
function requestNotificationPermission() {
  if (notificationsAllowed() || !Notification.isSupported()) return Promise.resolve(notificationsAllowed());
  pendingNotificationPermission ||= (async () => {
    const options = {
      type: "question",
      title: "LoopTalk notifications",
      message: "Allow LoopTalk to show notifications?",
      detail: "Get notified about new messages and incoming calls, even while LoopTalk is in the tray.",
      buttons: ["Allow", "Don't allow"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const parent = mainWindow?.isVisible() ? mainWindow : null;
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    const granted = response === 0;
    updateSettings({ notificationPermission: granted ? "granted" : "denied" });
    // The first toast also triggers the macOS system authorization prompt.
    if (granted) new Notification({ title: "LoopTalk", body: "Notifications are on.", icon: iconPath }).show();
    return granted;
  })().finally(() => {
    pendingNotificationPermission = null;
  });
  return pendingNotificationPermission;
}

function configureSession() {
  const appSession = session.defaultSession;
  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (!isAllowedPermission(permission, details.requestingUrl || webContents.getURL(), appUrl)) return callback(false);
    if (permission !== "notifications") return callback(true);
    requestNotificationPermission().then(callback, () => callback(false));
  });
  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isAllowedPermission(permission, requestingOrigin, appUrl) &&
    (permission !== "notifications" || notificationsAllowed()));
  appSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (!isAppOrigin(request.securityOrigin || request.frame?.url, appUrl)) return callback({});
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const choices = sources.slice(0, 10);
      if (!choices.length) return callback({});
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Share your screen",
        message: "Choose what to share with LoopTalk",
        buttons: [...choices.map((source) => source.name || "Screen"), "Cancel"],
        cancelId: choices.length,
        noLink: true,
      });
      if (response >= choices.length) return callback({});
      callback({
        video: choices[response],
        ...(process.platform === "win32" && request.audioRequested ? { audio: "loopback" } : {}),
      });
    } catch (error) {
      console.error("Screen sharing selection failed:", error);
      callback({});
    }
  }, { useSystemPicker: true });
}

function createWindow({ hidden }) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: "LoopTalk",
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: "#F5F7FA",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Keep the socket and timers alive in the tray so messages and calls still notify.
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!hidden) mainWindow.show();
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  const { webContents } = mainWindow;
  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (isAppOrigin(url, appUrl)) return;
    event.preventDefault();
    if (isExternalWebUrl(url)) shell.openExternal(url);
  });
  webContents.on("did-fail-load", (_event, errorCode, _description, url, isMainFrame) => {
    // -3 is an aborted navigation, which happens during normal in-app redirects.
    if (!isMainFrame || errorCode === -3 || !isAppOrigin(url, appUrl)) return;
    mainWindow.loadFile(path.join(__dirname, "offline.html"), { query: { retry: url } }).catch(() => {});
    retryTimer = setTimeout(() => loadApp(url), RETRY_DELAY_MS);
  });
  webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") loadApp();
  });

  loadApp();
}

function refreshTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: "Open LoopTalk", click: showWindow },
    { type: "separator" },
    {
      label: "Start at login",
      type: "checkbox",
      checked: isAutoLaunchEnabled(),
      enabled: app.isPackaged,
      click: (item) => {
        setAutoLaunch(item.checked);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "Quit LoopTalk", click: () => app.quit() },
  ]));
}

function createTray() {
  const image = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(process.platform === "darwin" ? image.resize({ width: 16, height: 16 }) : image);
  tray.setToolTip("LoopTalk");
  tray.on("click", showWindow);
  refreshTrayMenu();
}

function registerIpc() {
  ipcMain.handle("looptalk:notify", (event, input) => {
    if (!isTrustedSender(event) || !notificationsAllowed()) return false;
    const options = sanitizeNotification(input);
    if (options.tag) notifications.get(options.tag)?.close();
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: iconPath,
      silent: options.silent,
      timeoutType: options.requireInteraction ? "never" : "default",
      urgency: options.requireInteraction ? "critical" : "normal",
    });
    notification.on("click", () => {
      showWindow();
      mainWindow?.webContents.send("looptalk:notification-click", options.data);
    });
    notification.on("close", () => {
      if (options.tag && notifications.get(options.tag) === notification) notifications.delete(options.tag);
    });
    if (options.tag) notifications.set(options.tag, notification);
    notification.show();
    if (options.requireInteraction && process.platform !== "darwin") mainWindow?.flashFrame(true);
    return true;
  });
  ipcMain.handle("looptalk:close-notification", (event, tag) => {
    if (!isTrustedSender(event) || typeof tag !== "string") return;
    notifications.get(tag)?.close();
    notifications.delete(tag);
  });
}

function start() {
  initializeAutoLaunch();
  configureSession();
  registerIpc();
  createWindow({ hidden: wasLaunchedAtLogin() });
  createTray();
  mainWindow.on("focus", () => mainWindow.flashFrame(false));
  // Ask on the first visible launch so notifications work before the user opens Settings.
  const askOnce = () => {
    if (!readSettings().notificationPermission) requestNotificationPermission().catch(() => {});
  };
  if (mainWindow.isVisible()) askOnce();
  else mainWindow.once("show", askOnce);
}
