import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { useTranslation } from "./useTranslation";
import { showAlert } from "../utils/showAlert";
import {
  detectRelatedWebApp,
  getDesktopDownloadPlatform,
  getWebAppInstallHelp,
  installWebApp,
  isWebAppInstalled,
  subscribeWebAppInstallation,
} from "../utils/webAppInstall";

// Install (PWA) or download (packaged desktop app) state shared by every install entry point.
export const useAppInstall = () => {
  const t = useTranslation();
  const installed = useSyncExternalStore(subscribeWebAppInstallation, isWebAppInstalled, () => false);
  const [installing, setInstalling] = useState(false);
  const prompting = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    detectRelatedWebApp().catch((error) => console.error("Could not detect installed web app:", error));
  }, []);

  // Even with the web app installed, desktop browsers can still get the packaged app.
  const desktopDownload = Platform.OS === "web" && Boolean(getDesktopDownloadPlatform());
  const available = Platform.OS === "web" && (!installed || desktopDownload);

  const install = async () => {
    if (prompting.current) return;
    prompting.current = true;
    setInstalling(true);
    try {
      if ((await installWebApp()) === "manual") {
        const help = getWebAppInstallHelp();
        showAlert(t("settings.installApp"), t(
          help === "https" ? "messages.installRequiresHttps"
            : help === "ios" ? "messages.installIosInstructions" : "messages.installInstructions"
        ));
      }
    } catch (error) {
      console.error("Could not install web app:", error);
      showAlert(t("common.error"), t("messages.installFailed"));
    } finally {
      prompting.current = false;
      setInstalling(false);
    }
  };

  return {
    installed, available, desktopDownload, installing, install,
    label: t(desktopDownload ? "settings.downloadDesktopApp" : "settings.installApp"),
    hint: t(desktopDownload ? "settings.downloadDesktopAppDescription" : "settings.installAppDescription"),
  };
};
