import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText as Text } from "./AppText";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";
import { showAlert } from "../utils/showAlert";
import { requestPushPermission } from "../utils/callNotifications";
import {
  detectRelatedWebApp,
  getWebAppInstallHelp,
  installWebApp,
  isWebAppInstalled,
  subscribeWebAppInstallation,
} from "../utils/webAppInstall";

const readPermission = () =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

export const InvitationSetup = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const installed = useSyncExternalStore(subscribeWebAppInstallation, isWebAppInstalled, () => false);
  const [permission, setPermission] = useState(readPermission);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    detectRelatedWebApp().catch(() => {});
  }, []);

  if (Platform.OS !== "web") return null;

  const handleInstall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if ((await installWebApp()) === "manual") {
        const help = getWebAppInstallHelp();
        showAlert(t("settings.installApp"), t(
          help === "https" ? "messages.installRequiresHttps"
            : help === "ios" ? "messages.installIosInstructions" : "messages.installInstructions"
        ));
      }
    } catch {
      showAlert(t("common.error"), t("messages.installFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleAllow = async () => {
    setPermission(await requestPushPermission());
  };

  const permissionLabel = permission === "granted" ? t("invite.allowed")
    : permission === "denied" ? t("invite.blocked")
    : permission === "unsupported" ? t("invite.unsupported") : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("invite.setupTitle")}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{t("invite.stepInstall")}</Text>
        {installed ? <Text style={styles.done}>✓ {t("invite.installed")}</Text> : (
          <TouchableOpacity style={styles.button} onPress={handleInstall} disabled={busy} accessibilityRole="button">
            <Text style={styles.buttonText}>{t("invite.install")}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t("invite.stepNotifications")}</Text>
        {permissionLabel ? (
          <Text style={permission === "granted" ? styles.done : styles.muted}>
            {permission === "granted" ? "✓ " : ""}{permissionLabel}
          </Text>
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleAllow} accessibilityRole="button">
            <Text style={styles.buttonText}>{t("invite.allow")}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.label}>{t("invite.stepSignup")}</Text>
      <Text style={styles.muted}>{t("invite.acceptHint")}</Text>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 12, backgroundColor: colors.input },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { flexShrink: 1, fontSize: 15, color: colors.text },
  muted: { flexShrink: 1, fontSize: 13, lineHeight: 19, color: colors.secondaryText, textAlign: "right" },
  done: { color: colors.primary, fontWeight: "600" },
  button: { backgroundColor: colors.action, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
