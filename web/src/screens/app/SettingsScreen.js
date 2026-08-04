import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AuthAPI from "../../api/auth";
import * as UserAPI from "../../api/users";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import { t } from "../../i18n/i18n";
import { showAlert } from "../../utils/showAlert";
import { getCallPushToken } from "../../utils/callNotifications";
import { API_URL } from "../../config/environment";

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const THEME_OPTIONS = ["system", "light", "dark"];

export const SettingsScreen = ({ navigation }) => {
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const cleanup = useMessageStore((state) => state.cleanup);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const language = usePreferencesStore((state) => state.language);
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const notificationsEnabled = usePreferencesStore(
    (state) => state.notificationsEnabled
  );
  const updateLanguage = usePreferencesStore((state) => state.setLanguage);
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode);
  const setNotificationsEnabled = usePreferencesStore(
    (state) => state.setNotificationsEnabled
  );
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const [usernameVisible, setUsernameVisible] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

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

    if (Platform.OS === "web") {
      showAlert(t("common.error"), t("settings.notificationsUnavailable"));
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
    if (Platform.OS === "web" || typeof Linking.openSettings !== "function") {
      showAlert(t("settings.privacy"), t("settings.privacyDescription"));
      return;
    }
    Linking.openSettings().catch(() => {
      showAlert(t("settings.privacy"), t("settings.privacyDescription"));
    });
  };

  const openPublicPage = (path) => {
    Linking.openURL(`${API_URL}${path}`).catch(() => {
      showAlert(t("common.error"), t("settings.linkFailed"));
    });
  };

  const handleUsernameUpdate = async () => {
    if (savingUsername) return;
    const normalizedUsername = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(normalizedUsername)) {
      showAlert(t("common.error"), t("settings.usernameInvalid"));
      return;
    }

    setSavingUsername(true);
    try {
      const updatedUser = await UserAPI.updateProfile(
        { username: normalizedUsername },
        token
      );
      updateUser(updatedUser);
      setUsernameVisible(false);
      showAlert(t("common.success"), t("settings.usernameUpdated"));
    } catch (error) {
      showAlert(
        t("common.error"),
        error.response?.status === 409
          ? t("settings.usernameTaken")
          : t("common.error")
      );
    } finally {
      setSavingUsername(false);
    }
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.account")}</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() =>
            navigation.navigate("Contacts", {
              screen: "Profile",
              params: { userId: user.id, name: user.displayName },
            })
          }
        >
          <Ionicons name="person" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.profile")}</Text>
            <Text style={styles.settingValue}>{user.displayName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            setUsername(user.username);
            setUsernameVisible(true);
          }}
        >
          <Ionicons name="at" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.username")}</Text>
            <Text style={styles.settingValue}>@{user.username}</Text>
          </View>
          <Ionicons name="create-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>

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
          <Ionicons name="language" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.language")}</Text>
          </View>
          <View style={styles.segmentedControl}>
            {LANGUAGE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segment,
                  language === option.value && styles.segmentSelected,
                ]}
                onPress={() => updateLanguage(option.value)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    language === option.value && styles.segmentTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

        <TouchableOpacity style={styles.settingItem} onPress={() => openPublicPage("/support")}>
          <Ionicons name="help-buoy" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.support")}</Text>
            <Text style={styles.settingValue}>{t("settings.supportDescription")}</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={() => openPublicPage("/terms")}>
          <Ionicons name="document-text" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.terms")}</Text>
            <Text style={styles.settingValue}>{t("settings.termsDescription")}</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>

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

        <TouchableOpacity style={styles.settingItem} onPress={handleAbout}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.about")}</Text>
            <Text style={styles.settingValue}>{t("settings.version")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => openPublicPage("/account-deletion")}
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.secondaryText} />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{t("settings.deletionHelp")}</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("brand.name")} © 2026</Text>
        <Text style={styles.footerSubtext}>{t("settings.footer")}</Text>
      </View>

      <Modal
        visible={usernameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUsernameVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t("settings.changeUsername")}</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder={t("settings.usernameHint")}
              placeholderTextColor={colors.mutedText}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={handleUsernameUpdate}
              editable={!savingUsername}
            />
            <Text style={styles.inputHint}>{t("settings.usernameHint")}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setUsernameVisible(false)}
                disabled={savingUsername}
              >
                <Text style={styles.modalCancel}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimary]}
                onPress={handleUsernameUpdate}
                disabled={savingUsername || username.trim() === user.username}
              >
                {savingUsername ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>{t("common.save")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  themeOption: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  themeText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  input: {
    color: colors.text,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputHint: {
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 20,
  },
  modalButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalPrimary: {
    minWidth: 130,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  modalCancel: {
    color: colors.secondaryText,
    fontWeight: "600",
  },
  modalPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
