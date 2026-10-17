import React, { useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, TouchableOpacity, View, ScrollView } from "react-native";
import { UserProfileHeader } from "../../components/UserProfileHeader";
import { AppText as Text } from "../../components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AuthAPI from "../../api/auth";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import { t } from "../../i18n/i18n";
import { showAlert } from "../../utils/showAlert";
import { getCallPushToken } from "../../utils/callNotifications";
import { getChatMessageFontSize } from "../../utils/chatTextSize";
import { API_URL } from "../../config/environment";

const THEME_OPTIONS = ["system", "light", "dark"];
const CHAT_TEXT_SIZE_OPTIONS = ["standard", "large", "extraLarge"];

export const SettingsScreen = ({ navigation }) => {
  const logout = useAuthStore((state) => state.logout);
  const cleanup = useMessageStore((state) => state.cleanup);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const chatTextSize = usePreferencesStore((state) => state.chatTextSize);
  const notificationsEnabled = usePreferencesStore(
    (state) => state.notificationsEnabled
  );
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode);
  const setChatTextSize = usePreferencesStore((state) => state.setChatTextSize);
  const setNotificationsEnabled = usePreferencesStore(
    (state) => state.setNotificationsEnabled
  );
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [externalLinksExpanded, setExternalLinksExpanded] = useState(false);

  const handleNotificationsChange = async (enabled) => {
    if (!enabled) {
      try {
        await AuthAPI.disableDeviceTokens(token);
      } catch (error) {
        showAlert(t("common.error"), t("settings.notificationsFailed"));
      } finally {
        await setNotificationsEnabled(false);
      }
      return;
    }

    try {
      const Notifications = require("expo-notifications");
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") {
        showAlert(t("common.error"), t("settings.notificationsDenied"));
        return;
      }

      const deviceToken = await getCallPushToken();
      await AuthAPI.registerDeviceToken(deviceToken, Platform.OS, token);
      await setNotificationsEnabled(true);
    } catch (error) {
      showAlert(t("common.error"), t("settings.notificationsFailed"));
    }
  };

  const performLogout = async () => {
    cleanup();
    await logout();
  };

  const handleLogout = () => {
    showAlert(t("settings.logout"), t("settings.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logout"),
        style: "destructive",
        onPress: performLogout,
      },
    ]);
  };

  const performAccountDeletion = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      await AuthAPI.deleteAccount(token);
      cleanup();
      await logout();
    } catch (error) {
      showAlert(t("common.error"), t("settings.deleteAccountFailed"));
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    showAlert(t("settings.deleteAccount"), t("settings.deleteAccountConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteAccount"),
        style: "destructive",
        onPress: () => showAlert(
          t("settings.deleteAccountFinalTitle"),
          t("settings.deleteAccountFinalConfirm"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("settings.deletePermanently"),
              style: "destructive",
              onPress: performAccountDeletion,
            },
          ]
        ),
      },
    ]);
  };

  const handleAbout = () => {
    showAlert(t("settings.about"), t("settings.aboutBody"));
  };

  const handlePermissionSettings = () => {
    Linking.openSettings().catch(() => {
      showAlert(t("settings.privacy"), t("settings.privacyDescription"));
    });
  };

  const openPublicPage = (path) => {
    Linking.openURL(`${API_URL}${path}`).catch(() => {
      showAlert(t("common.error"), t("settings.linkFailed"));
    });
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <UserProfileHeader user={user} editable />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.account")}</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate("MyInvitations", { filter: "all" })}
        >
          <Ionicons name="link" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.myInvitations")}</Text>
            <Text style={styles.settingValue}>
              {t("settings.myInvitationsDescription")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={handlePermissionSettings}>
          <Ionicons name="lock-closed" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.devicePermissions")}</Text>
            <Text style={styles.settingValue}>{t("settings.privacyDescription")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.preferences")}</Text>

        <View style={styles.settingItem}>
          <Ionicons name="notifications" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.notifications")}</Text>
            <Text style={styles.settingValue}>
              {t("settings.notificationDescription")}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsChange}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        <View style={styles.modeItem}>
          <View style={styles.modeHeading}>
            <Ionicons name="text" size={20} color={colors.primary} />
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>{t("settings.chatTextSize")}</Text>
              <Text style={styles.settingValue}>
                {t("settings.chatTextSizeDescription")}
              </Text>
            </View>
          </View>
          <View style={styles.textSizeControl}>
            {CHAT_TEXT_SIZE_OPTIONS.map((option) => {
              const selected = chatTextSize === option;
              const sampleSize = getChatMessageFontSize(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.textSizeOption, selected && styles.segmentSelected]}
                  onPress={() => setChatTextSize(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(`settings.chatTextSize.${option}`)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.textSizeSample,
                      { fontSize: sampleSize, color: selected ? "#FFFFFF" : colors.text },
                    ]}
                    allowGlobalTextScale={false}
                  >
                    Aa
                  </Text>
                  <Text
                    style={[styles.textSizeLabel, selected && styles.segmentTextSelected]}
                  >
                    {t(`settings.chatTextSize.${option}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.modeItem}>
          <View style={styles.modeHeading}>
            <Ionicons name="contrast" size={20} color={colors.primary} />
            <Text style={styles.settingLabel}>{t("settings.colorMode")}</Text>
          </View>
          <View style={styles.themeControl}>
            {THEME_OPTIONS.map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.themeOption,
                  themeMode === mode && styles.segmentSelected,
                ]}
                onPress={() => setThemeMode(mode)}
              >
                <Ionicons
                  name={
                    mode === "system"
                      ? "phone-portrait-outline"
                      : mode === "light"
                        ? "sunny-outline"
                        : "moon-outline"
                  }
                  size={18}
                  color={themeMode === mode ? "#FFFFFF" : colors.secondaryText}
                />
                <Text
                  style={[
                    styles.themeText,
                    themeMode === mode && styles.segmentTextSelected,
                  ]}
                >
                  {t(`settings.${mode}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.helpSupport")}</Text>

        <TouchableOpacity style={styles.settingItem} onPress={handleAbout}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.about")}</Text>
            <Text style={styles.settingValue}>{t("settings.version")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setExternalLinksExpanded((expanded) => !expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded: externalLinksExpanded }}
        >
          <Ionicons name="open-outline" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.externalLinks")}</Text>
          </View>
          <Ionicons
            name={externalLinksExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.mutedText}
          />
        </TouchableOpacity>
        {externalLinksExpanded && (
          <View style={styles.externalLinksContent}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => openPublicPage("/privacy")}
            >
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>{t("settings.privacy")}</Text>
                <Text style={styles.settingValue}>
                  {t("settings.privacyPolicyDescription")}
                </Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => openPublicPage("/support")}
            >
              <Ionicons name="help-buoy" size={20} color={colors.primary} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>{t("settings.support")}</Text>
                <Text style={styles.settingValue}>{t("settings.supportDescription")}</Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => openPublicPage("/terms")}
            >
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>{t("settings.terms")}</Text>
                <Text style={styles.settingValue}>{t("settings.termsDescription")}</Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => openPublicPage("/account-deletion")}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>{t("settings.deletionHelp")}</Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.settingItem, styles.dangerItem]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out" size={20} color={colors.danger} />
          <View style={styles.settingContent}>
            <Text style={styles.dangerLabel}>{t("settings.logout")}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.settingItem, styles.dangerItem]}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        >
          {deletingAccount ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          )}
          <View style={styles.settingContent}>
            <Text style={styles.dangerLabel}>{t("settings.deleteAccount")}</Text>
            <Text style={styles.settingValue}>{t("settings.deleteAccountDescription")}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("brand.name")} © 2026</Text>
        <Text style={styles.footerSubtext}>{t("settings.footer")}</Text>
      </View>

    </ScrollView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.secondaryText,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  settingItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  settingValue: {
    fontSize: 13,
    color: colors.mutedText,
    marginTop: 2,
  },
  externalLinksContent: {
    paddingLeft: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dangerItem: {
    backgroundColor: colors.dangerSoft,
  },
  dangerLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.danger,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.input,
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentTextSelected: {
    color: "#FFFFFF",
  },
  modeItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modeHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  themeControl: {
    flexDirection: "row",
    gap: 8,
  },
  textSizeControl: {
    flexDirection: "row",
    gap: 8,
  },
  textSizeOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.input,
    paddingHorizontal: 3,
  },
  textSizeSample: {
    fontWeight: "700",
  },
  textSizeLabel: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 3,
    textAlign: "center",
  },
  themeOption: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  themeText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    marginTop: 16,
  },
  footerText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.mutedText,
    marginTop: 4,
  },
});
