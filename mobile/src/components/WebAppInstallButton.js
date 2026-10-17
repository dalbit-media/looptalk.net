import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";
import { showAlert } from "../utils/showAlert";
import {
  detectRelatedWebApp,
  getWebAppInstallationId,
  getWebAppInstallHelp,
  installWebApp,
  isWebAppInstalled,
  subscribeWebAppInstallation,
} from "../utils/webAppInstall";

export const WebAppInstallButton = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const token = useAuthStore((state) => state.token);
  const installed = useSyncExternalStore(
    subscribeWebAppInstallation, isWebAppInstalled, () => false
  );
  const [installing, setInstalling] = useState(false);
  const prompting = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    detectRelatedWebApp().catch((error) =>
      console.error("Could not detect installed web app:", error)
    );
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !installed || !token) return;
    let pending = false;
    let reported = false;
    const report = async () => {
      if (pending || reported) return;
      pending = true;
      try {
        await api.post("/telemetry/web-app-install", {
          installationId: getWebAppInstallationId(),
        }, { headers: { Authorization: `Bearer ${token}` } });
        reported = true;
      } catch (error) {
        console.error("Could not record web app installation:", error);
      } finally {
        pending = false;
      }
    };
    report();
    const interval = window.setInterval(report, 60_000);
    window.addEventListener("online", report);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", report);
    };
  }, [installed, token]);

  if (Platform.OS !== "web" || installed) return null;

  const handleInstall = async () => {
    if (prompting.current) return;
    prompting.current = true;
    setInstalling(true);
    try {
      const result = await installWebApp();
      if (result === "manual") {
        const help = getWebAppInstallHelp();
        showAlert(t("settings.installApp"), t(
          help === "https"
            ? "messages.installRequiresHttps"
            : help === "ios"
              ? "messages.installIosInstructions"
              : "messages.installInstructions"
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

  return (
    <TouchableOpacity
      onPress={handleInstall}
      disabled={installing}
      accessibilityRole="button"
      accessibilityLabel={t("settings.installApp")}
      accessibilityHint={t("settings.installAppDescription")}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="download-outline" size={24} color={colors.headerIcon} />
    </TouchableOpacity>
  );
};
