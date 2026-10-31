import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { UserProfileHeader } from "../../components/UserProfileHeader";
import { MemberFeatureGate } from "../../components/MemberFeatureGate";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useCallStore } from "../../store/callStore";
import { useContactStore } from "../../store/contactStore";
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
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const isMember = currentUser?.member !== false;
  const contacts = useContactStore((state) => state.contacts);
  const addContact = useContactStore((state) => state.addContact);
  const userId = route.params?.userId || currentUser?.id;
  const startCall = useCallStore((state) => state.startCall);
  const isCallingSupported = useCallStore((state) => state.isCallingSupported);
  const isVideoCallingSupported = useCallStore(
    (state) => state.isVideoCallingSupported
  );

  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingContact, setAddingContact] = useState(false);
  const isContact = Object.values(contacts).flat().some(
    (contact) => String(contact.contactUserId) === String(userId)
  );

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = async () => {
    try {
      const profile = String(userId) === String(currentUser?.id)
        ? currentUser
        : await UserAPI.getUser(userId, token);
      const contact = Object.values(contacts).flat().find(
        (item) => String(item.contactUserId) === String(userId)
      );
      setUserProfile({
        ...profile,
        displayName: contact?.nickname ||
          (profile.displayName !== profile.username && profile.displayName !== profile.id ? profile.displayName : null) ||
          contact?.contactUser?.displayName ||
          route.params?.name || profile.displayName || profile.username || profile.id,
      });
    } catch (error) {
      showAlert(t("common.error"), t("profile.loadFailed"));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async () => {
    if (!isMember || addingContact || isContact) return;
    setAddingContact(true);
    try {
      await addContact(userId, "All Contacts 1", null, token, userProfile.displayName);
      showAlert(t("common.success"), t("contacts.added"));
    } catch (error) {
      showAlert(t("common.error"), t("contacts.addFailed"));
    } finally {
      setAddingContact(false);
    }
  };

  const handleStartChat = async () => {
    if (!isMember) return;
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

  const handleStartCall = async (callType) => {
    if (!isMember) return;
    try {
      const result = await startCall(
        () => MessageAPI.getOrCreateDirectConversation(userId, token)
          .then((conversation) => conversation.id),
        callType,
        userProfile
      );
      if (result === "device-unavailable") {
        showAlert(t("common.error"), t("calls.deviceNotFound"));
      }
    } catch (error) {
      console.error("Error starting call:", error);
      showAlert(
        t("common.error"),
        error?.code === "CALL_PERMISSION_DENIED" ||
          error?.name === "NotAllowedError" ||
          error?.name === "SecurityError"
          ? t("calls.mediaPermissionDenied")
          : error?.code === "CALL_SIGNALING_UNAVAILABLE"
            ? t("calls.signalingUnavailable")
            : t("calls.callFailed")
      );
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
            await ReportAPI.submitReport({
              reportedUserId: userId, category, discloseToOperator: true,
            }, token);
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

  const isOwnProfile =
    currentUser?.id != null &&
    userProfile.id != null &&
    String(currentUser.id) === String(userProfile.id);

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <UserProfileHeader user={isOwnProfile ? currentUser : userProfile} editable={isOwnProfile} />
        {isOwnProfile && (
          <View style={styles.actionContainer}>
            <Text style={{ color: colors.secondaryText, lineHeight: 23 }}>{t("privacy.profileNotice")}</Text>
          </View>
        )}

        {!isOwnProfile && (
          <View style={styles.actionContainer}>
            {!isMember ? (
              <MemberFeatureGate
                message="memberAccess.profile"
                onJoinNetwork={() => navigation.navigate("Forum", { screen: "JoinNetwork" })}
              />
            ) : (
              <>
                {!isContact && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleAddContact}
                    disabled={addingContact}
                    accessibilityRole="button"
                    accessibilityLabel={t("contacts.addContact")}
                  >
                    {addingContact ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Ionicons name="person-add-outline" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>{t("contacts.addContact")}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.primaryButton} onPress={handleStartChat}>
                  <Ionicons name="chatbubble" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>{t("profile.sendMessage")}</Text>
                </TouchableOpacity>

                {(isCallingSupported || isVideoCallingSupported) && (
                  <View style={styles.callActions}>
                    {isCallingSupported && (
                      <TouchableOpacity
                        style={[styles.callButton, styles.voiceCallButton]}
                        onPress={() => handleStartCall("audio")}
                        accessibilityRole="button"
                        accessibilityLabel={t("calls.startAudioCall")}
                      >
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                        <Text style={styles.callButtonText}>{t("calls.audioCall")}</Text>
                      </TouchableOpacity>
                    )}
                    {isVideoCallingSupported && (
                      <TouchableOpacity
                        style={[styles.callButton, styles.videoCallButton]}
                        onPress={() => handleStartCall("video")}
                        accessibilityRole="button"
                        accessibilityLabel={t("calls.startVideoCall")}
                      >
                        <Ionicons name="videocam" size={18} color="#FFFFFF" />
                        <Text style={styles.callButtonText}>{t("calls.videoCall")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}

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
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.action,
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
  callActions: {
    flexDirection: "row",
    gap: 10,
  },
  callButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  voiceCallButton: {
    backgroundColor: "#247A3E",
  },
  videoCallButton: {
    backgroundColor: colors.primary,
  },
  callButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
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
