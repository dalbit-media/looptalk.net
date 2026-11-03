import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { browserNotificationPermission, enablePushNotifications } from "../utils/pushRegistration";
import { webNotificationSupport } from "../utils/webNotificationSupport";

export const NotificationSetup = ({ onClose }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [permission, setPermission] = useState(browserNotificationPermission);
  const [phase, setPhase] = useState("ready");
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const support = webNotificationSupport();
  const busy = phase === "permission" || phase === "registering";
  const done = phase === "done";

  const enable = async () => {
    if (pending.current) return;
    pending.current = true;
    setPhase("permission");
    setError(null);
    try {
      const result = await enablePushNotifications({
        onPermissionGranted: () => { setPermission("granted"); setPhase("registering"); },
      });
      setPermission(browserNotificationPermission());
      if (result === "granted") {
        setPhase("done");
      } else {
        setPhase("ready");
        setError(result === "denied" ? "blocked" : result === "default" ? "dismissed" : result);
      }
    } catch (failure) {
      console.error("Could not enable web notifications:", failure);
      setPermission(browserNotificationPermission());
      setPhase("ready");
      setError("failed");
    } finally {
      pending.current = false;
    }
  };
  const help = support !== "ready" ? support : permission === "denied" ? "blocked" : error;
  const close = () => { if (!pending.current) onClose(); };
  return (
    <View style={styles.dialog}>
      <Text style={styles.title} accessibilityRole="header">{t("setup.notificationsTitle")}</Text>
      <Text style={styles.body}>{t("notificationSetup.intro")}</Text>
      {["prepare", "permission", "register"].map((step, index) => (
        <View key={step} style={styles.step}>
          <Text style={styles.number}>{index + 1}</Text>
          <Text style={styles.body}>{t(`notificationSetup.${step}`)}</Text>
        </View>
      ))}
      {help && <Text accessibilityLiveRegion="polite" style={styles.feedback}>
        {t(`notificationSetup.${help}`)}
      </Text>}
      {busy && <View style={styles.progress}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {t(`notificationSetup.${phase === "registering" ? "connecting" : "waiting"}`)}
        </Text>
      </View>}
      {done && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{t("notificationSetup.success")}</Text>}
      {!done && support === "ready" && <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={t("notificationSetup.enable")} accessibilityState={{ disabled: busy }}
        disabled={busy} onPress={enable} style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>{t("notificationSetup.enable")}</Text>
      </TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={close}
        accessibilityLabel={t("common.close")}
        accessibilityState={{ disabled: busy }} style={styles.close}>
        <Text style={styles.body}>{t("common.close")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  dialog: { backgroundColor: colors.surface, padding: 20, borderBottomWidth: 1, borderColor: colors.border },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, color: colors.text, flexShrink: 1 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 16 },
  number: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  feedback: { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 20 },
  progress: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 20 },
  button: { minHeight: 44, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 20, padding: 10 },
  buttonText: { color: colors.onAction, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  close: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
});
