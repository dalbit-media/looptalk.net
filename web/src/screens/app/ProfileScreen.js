import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import * as UserAPI from "../../api/users";
import * as MessageAPI from "../../api/messages";
import * as ReportAPI from "../../api/reports";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { showAlert } from "../../utils/showAlert";

export const ProfileScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const { userId } = route.params;
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);

  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = async () => {
    try {
      const profile = await UserAPI.getUser(userId, token);
      setUserProfile(profile);
    } catch (error) {
      showAlert(t("common.error"), t("profile.loadFailed"));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    try {
      const conversation = await MessageAPI.getOrCreateDirectConversation(
        userId,
        token
      );
      // Chat lives in the Messages tab's stack, not the Contacts stack that
      // hosts this screen, so it must be reached via the parent tab navigator.
      navigation.navigate("Messages", {
        screen: "Chat",
        params: {
          conversationId: conversation.id,
          name: userProfile.displayName,
        },
      });
    } catch (error) {
      showAlert(t("common.error"), t("profile.startChatFailed"));
    }
  };

  const handleBlock = async () => {
    showAlert(t("profile.blockTitle"), t("profile.blockConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.block"),
        style: "destructive",
        onPress: async () => {
          try {
            await UserAPI.blockUser(userId, token);
            showAlert(t("common.success"), t("profile.blocked"));
            navigation.goBack();
          } catch (error) {
            showAlert(t("common.error"), t("profile.blockFailed"));
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    const categories = ["SPAM", "HARASSMENT", "HATE", "IMPERSONATION", "OTHER"];
    showAlert(t("reports.reportUser"), t("reports.chooseReason"), [
      ...categories.map((category) => ({
        text: t(`reports.category.${category}`),
        onPress: async () => {
          try {
            await ReportAPI.submitReport({ reportedUserId: userId, category }, token);
            showAlert(t("reports.submittedTitle"), t("reports.submittedBody"));
          } catch (error) {
            showAlert(
              t("common.error"),
              error.response?.status === 409
                ? t("reports.alreadySubmitted")
                : t("reports.failed")
            );
          }
        },
      })),
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t("profile.notFound")}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{userProfile.displayName[0]}</Text>
        </View>

        <Text style={styles.displayName}>{userProfile.displayName}</Text>
        <Text style={styles.username}>@{userProfile.username}</Text>

        {userProfile.status === "ACTIVE" && (
          <View style={styles.onlineStatus}>
            <View style={styles.onlineIndicator} />
            <Text style={styles.onlineText}>{t("profile.online")}</Text>
          </View>
        )}
      </View>

      {userProfile.bio && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.bio")}</Text>
          <Text style={styles.bioText}>{userProfile.bio}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("profile.info")}</Text>
        <View style={styles.infoItem}>
          <Ionicons name="calendar" size={18} color={colors.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>{t("profile.joined")}</Text>
            <Text style={styles.infoValue}>
              {new Date(userProfile.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </View>

      {currentUser.id !== userId && (
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartChat}>
            <Ionicons name="chatbubble" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>{t("profile.sendMessage")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleBlock}>
            <Ionicons name="ban" size={18} color={colors.danger} />
            <Text style={styles.secondaryButtonText}>{t("profile.block")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
            <Ionicons name="flag-outline" size={18} color={colors.secondaryText} />
            <Text style={styles.reportButtonText}>{t("reports.reportUser")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
  },
  displayName: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  username: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 4,
  },
  onlineStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#31a24c",
  },
  onlineText: {
    fontSize: 12,
    color: "#31a24c",
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.secondaryText,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  bioText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.mutedText,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginTop: 2,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.danger,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "600",
  },
  reportButton: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  reportButtonText: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    color: colors.mutedText,
  },
});
