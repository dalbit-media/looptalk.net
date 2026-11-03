import React, { useEffect } from "react";
import { Platform, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useAppTheme } from "../hooks/useAppTheme";
import { useAppInstall } from "../hooks/useAppInstall";
import { getWebAppInstallationId } from "../utils/webAppInstall";

export const WebAppInstallButton = () => {
  const { colors } = useAppTheme();
  const token = useAuthStore((state) => state.token);
  const { installed, available, installing, install, label, hint } = useAppInstall();

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
        }, { headers: { Authorization: ["Bearer", token].join(" ") } });
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

  if (!available) return null;

  return (
    <TouchableOpacity
      onPress={install}
      disabled={installing}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="download-outline" size={24} color={colors.headerIcon} />
    </TouchableOpacity>
  );
};
