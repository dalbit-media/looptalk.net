import { Platform } from "react-native";

let deferredInstallPrompt = null;
const INSTALLED_KEY = "looptalk.webAppInstalled";
const INSTALLATION_KEY = "looptalk.webAppInstallationId";
const listeners = new Set();
const isWeb = Platform.OS === "web" && typeof window !== "undefined";
let installed = false;

const readStorage = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error("Could not read web app installation state:", error);
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (error) {
    console.error("Could not save web app installation state:", error);
  }
};

let installationId = null;
const markInstalled = () => {
  installed = true;
  deferredInstallPrompt = null;
  writeStorage(INSTALLED_KEY, "true");
  listeners.forEach((listener) => listener());
};

if (isWeb) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  installed = standalone.matches || window.navigator.standalone === true ||
    readStorage(INSTALLED_KEY) === "true";
  if (installed) writeStorage(INSTALLED_KEY, "true");
  window.addEventListener("storage", (event) => {
    if (event.key !== INSTALLED_KEY) return;
    installed = standalone.matches || window.navigator.standalone === true ||
      event.newValue === "true";
    installationId = null;
    listeners.forEach((listener) => listener());
  });
  standalone.addEventListener("change", (event) => {
    if (event.matches) markInstalled();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    // A new install offer also lets a previously uninstalled browser install again.
    installed = false;
    installationId = null;
    writeStorage(INSTALLED_KEY, null);
    writeStorage(INSTALLATION_KEY, null);
    deferredInstallPrompt = event;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", markInstalled);

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "/app/manifest.webmanifest";
    document.head.appendChild(manifestLink);
  }
}

export const subscribeWebAppInstallation = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isWebAppInstalled = () => installed;

export const detectRelatedWebApp = async () => {
  if (!isWeb || installed || !window.navigator.getInstalledRelatedApps) return;
  const apps = await window.navigator.getInstalledRelatedApps();
  const manifestUrl = new URL("/app/manifest.webmanifest", window.location.origin).href;
  if (apps.some((app) => app.platform === "webapp" && app.url === manifestUrl)) {
    markInstalled();
  }
};

export const getWebAppInstallationId = () => {
  if (!isWeb || !installed) throw new Error("Web app is not installed");
  if (!installationId) {
    installationId = readStorage(INSTALLATION_KEY) ||
      window.crypto?.randomUUID?.() ||
      `install_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    writeStorage(INSTALLATION_KEY, installationId);
  }
  return installationId;
};

export const getWebAppInstallHelp = () => {
  if (!isWeb) return "browser";
  if (window.isSecureContext === false) return "https";
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = window.navigator;
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }
  return "browser";
};

export const installWebApp = async () => {
  if (!isWeb || installed) return "unavailable";
  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    const result = await prompt.prompt();
    const choice = result || await prompt.userChoice;
    if (choice?.outcome !== "accepted" && choice?.outcome !== "dismissed") {
      throw new Error("The browser did not return a valid installation outcome");
    }
    return choice.outcome;
  }
  return "manual";
};
