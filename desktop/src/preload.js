const { contextBridge, ipcRenderer } = require("electron");

const CLICK_CHANNEL = "looptalk:notification-click";

// Permission uses the standard Notification API (see main.js); the bridge only adds native toasts.
contextBridge.exposeInMainWorld("looptalkDesktop", {
  notify: (notification) => ipcRenderer.invoke("looptalk:notify", notification),
  closeNotification: (tag) => ipcRenderer.invoke("looptalk:close-notification", tag),
  onNotificationClick: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(CLICK_CHANNEL, listener);
    return () => ipcRenderer.removeListener(CLICK_CHANNEL, listener);
  },
});
