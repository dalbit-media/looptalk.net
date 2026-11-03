import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { useTranslation } from "./useTranslation";
import { showAlert } from "../utils/showAlert";
import {
  detectRelatedWebApp,
  getWebAppInstallHelp,
  installWebApp,
  isWebAppInstalled,
  subscribeWebAppInstallation,
} from "../utils/webAppInstall";

// Optional browser install (PWA) shared by every install entry point; the web app works fully without it.
export const useAppInstall = () => {
  const t = useTranslation();
  const installed = useSyncExternalStore(subscribeWebAppInstallation, isWebAppInstalled, () => false);
  const [installing, setInstalling] = useState(false);
  const prompting = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    detectRelatedWebApp().catch((error) => console.error("Could not detect installed web app:", error));
  }, []);

  const available = Platform.OS === "web" && !installed;

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
    installed, available, installing, install,
    label: t("settings.installApp"),
    hint: t("settings.installAppDescription"),
  };
};
