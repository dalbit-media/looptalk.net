import React, { useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { usePreferencesStore } from "../store/preferencesStore";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppInstall } from "../hooks/useAppInstall";
import { Banner } from "./GuestJoinBanner";
import { isDesktopApp } from "../utils/desktopApp";
import { NotificationSetup } from "./NotificationSetup";

// Invitation accounts start with generated credentials; nudge members to make the account theirs,
// then offer browser notifications and optional installation together.
export const AccountSetupBanner = ({ onPress }) => {
  const t = useTranslation();
  const member = useAuthStore((state) => state.user?.member !== false && Boolean(state.user));
  const dismissed = useAuthStore((state) => state.setupBannerDismissed);
  const dismiss = useAuthStore((state) => state.dismissSetupBanner);
  const setup = useAuthStore((state) => state.accountSetup);
  const { available: installable, label, hint, install, installing } = useAppInstall();
  const { colors } = useAppTheme();
  const enabled = usePreferencesStore((state) => state.notificationsEnabled);
  const [showNotifications, setShowNotifications] = useState(false);
  const personalize = Boolean(setup?.generated) && !setup.linkedProviders?.length;
  const askNotifications = Platform.OS === "web" && !enabled && !isDesktopApp();
  if (!member || dismissed || (!personalize && !askNotifications && !installable && !showNotifications)) return null;

  if (!personalize) {
    const actionStyle = { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row",
      alignItems: "center", justifyContent: "center", gap: 6, padding: 8 };
    return (
      <>
        {(askNotifications || installable) && <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 16,
          marginVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft }}>
          {askNotifications && <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={t("setup.notificationsTitle")} onPress={() => setShowNotifications(true)} style={actionStyle}>
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 13, flexShrink: 1 }}>{t("setup.notificationsTitle")}</Text>
          </TouchableOpacity>}
          {installable && <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
            accessibilityHint={hint} disabled={installing} onPress={install} style={actionStyle}>
            <Ionicons name="download-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 13, flexShrink: 1 }}>{label}</Text>
          </TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("setup.dismiss")}
            onPress={dismiss} style={{ minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>}
        {showNotifications && <NotificationSetup onClose={() => setShowNotifications(false)} />}
      </>
    );
  }

  return (
    <Banner
      icon="person-circle-outline"
      title={t("setup.bannerTitle")}
      body={t("setup.bannerBody")}
      onPress={onPress}
      onDismiss={dismiss}
      dismissLabel={t("setup.dismiss")}
    />
  );
};
