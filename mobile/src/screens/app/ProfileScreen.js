import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image, Modal } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useCallStore } from "../../store/callStore";
import * as UserAPI from "../../api/users";
import * as MessageAPI from "../../api/messages";
import * as ReportAPI from "../../api/reports";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { API_URL } from "../../config/environment";
import { showAlert } from "../../utils/showAlert";

export const ProfileScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const { userId } = route.params;
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const updateCurrentUser = useAuthStore((state) => state.updateUser);
  const startCall = useCallStore((state) => state.startCall);
  const isCallingSupported = useCallStore((state) => state.isCallingSupported);
  const isVideoCallingSupported = useCallStore(
    (state) => state.isVideoCallingSupported
  );

  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayNameVisible, setDisplayNameVisible] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [bioVisible, setBioVisible] = useState(false);
  const [bio, setBio] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

  const handleStartCall = async (callType) => {
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

  const handleProfilePhotoPick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert(t("common.error"), t("messages.mediaLibraryPermissionDenied"));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      const photo = result.assets?.[0];
      if (result.canceled || !photo?.uri) return;

      setUploadingPhoto(true);
      const uploaded = await UserAPI.uploadProfilePicture(
        {
          uri: photo.uri,
          file: photo.file,
          fileName: `profile-${Date.now()}.jpg`,
          mimeType: photo.mimeType || "image/jpeg",
        },
        token
      );
      const updatedUser = await UserAPI.updateProfile(
        { profilePicture: uploaded.url },
        token
      );
      updateCurrentUser(updatedUser);
      setUserProfile((profile) => ({ ...profile, ...updatedUser }));
      showAlert(t("common.success"), t("profile.photoUpdated"));
    } catch (error) {
      showAlert(t("common.error"), t("profile.photoUpdateFailed"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDisplayNameUpdate = async () => {
    if (savingDisplayName) return;
    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName || normalizedDisplayName.length > 100) {
      showAlert(t("common.error"), t("settings.displayNameInvalid"));
      return;
    }

    setSavingDisplayName(true);
    try {
      const updatedUser = await UserAPI.updateProfile(
        { displayName: normalizedDisplayName },
        token
      );
      updateCurrentUser(updatedUser);
      setUserProfile((profile) => ({ ...profile, ...updatedUser }));
      setDisplayNameVisible(false);
      showAlert(t("common.success"), t("settings.displayNameUpdated"));
    } catch (error) {
      showAlert(t("common.error"), t("common.error"));
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleBioUpdate = async () => {
    if (savingBio) return;
    const normalizedBio = bio.trim();
    if (normalizedBio.length > 500) {
      showAlert(t("common.error"), t("profile.bioInvalid"));
      return;
    }

    setSavingBio(true);
    try {
      const updatedUser = await UserAPI.updateProfile({ bio: normalizedBio }, token);
      updateCurrentUser(updatedUser);
      setUserProfile((profile) => ({ ...profile, ...updatedUser }));
      setBioVisible(false);
      showAlert(t("common.success"), t("profile.bioUpdated"));
    } catch (error) {
      showAlert(t("common.error"), t("profile.bioUpdateFailed"));
    } finally {
      setSavingBio(false);
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

  const isOwnProfile =
    currentUser?.id != null &&
    userProfile.id != null &&
    String(currentUser.id) === String(userProfile.id);
  const profilePhotoUri = userProfile.profilePicture
    ? `${API_URL}${userProfile.profilePicture}`
    : null;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{userProfile.displayName?.[0] || "?"}</Text>
            )}
          </View>

          <Text style={styles.displayName}>{userProfile.displayName}</Text>
          <Text style={styles.username}>@{userProfile.username}</Text>

          {isOwnProfile && (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleProfilePhotoPick}
                disabled={uploadingPhoto}
                accessibilityRole="button"
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.editButtonText}>{t("profile.changePhoto")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  setDisplayName(userProfile.displayName);
                  setDisplayNameVisible(true);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={styles.editButtonText}>{t("profile.changeDisplayName")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {userProfile.status === "ACTIVE" && (
            <View style={styles.onlineStatus}>
              <View style={styles.onlineIndicator} />
              <Text style={styles.onlineText}>{t("profile.online")}</Text>
            </View>
          )}
        </View>

        {(userProfile.bio || isOwnProfile) && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, styles.bioSectionTitle]}>{t("profile.bio")}</Text>
              {isOwnProfile && (
                <TouchableOpacity
                  style={styles.bioEditButton}
                  onPress={() => {
                    setBio(userProfile.bio || "");
                    setBioVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(userProfile.bio ? "profile.editBio" : "profile.addBio")}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                  <Text style={styles.bioEditButtonText}>
                    {t(userProfile.bio ? "profile.editBio" : "profile.addBio")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {userProfile.bio ? (
              <Text style={styles.bioText}>{userProfile.bio}</Text>
            ) : isOwnProfile ? (
              <Text style={styles.bioPlaceholder}>{t("profile.bioHint")}</Text>
            ) : null}
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

        {!isOwnProfile && (
          <View style={styles.actionContainer}>
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
        <Modal
          visible={displayNameVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDisplayNameVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t("settings.changeDisplayName")}</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={t("settings.displayNameHint")}
                placeholderTextColor={colors.mutedText}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={handleDisplayNameUpdate}
                editable={!savingDisplayName}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setDisplayNameVisible(false)}
                  disabled={savingDisplayName}
                >
                  <Text style={styles.modalCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimary]}
                  onPress={handleDisplayNameUpdate}
                  disabled={savingDisplayName || displayName.trim() === userProfile.displayName}
                >
                  {savingDisplayName ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalPrimaryText}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={bioVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBioVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t("profile.bio")}</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder={t("profile.bioHint")}
                placeholderTextColor={colors.mutedText}
                multiline
                maxLength={500}
                textAlignVertical="top"
                editable={!savingBio}
              />
              <Text style={styles.bioCharacterCount}>{bio.length}/500</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setBioVisible(false)}
                  disabled={savingBio}
                >
                  <Text style={styles.modalCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimary]}
                  onPress={handleBioUpdate}
                  disabled={savingBio || bio.trim() === (userProfile.bio || "")}
                >
                  {savingBio ? (
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
    </View>
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
    overflow: "hidden",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
  editActions: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  editButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  editButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
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
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bioSectionTitle: {
    marginBottom: 0,
  },
  bioEditButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  bioEditButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  bioText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  bioPlaceholder: {
    fontSize: 14,
    color: colors.mutedText,
    lineHeight: 20,
  },
  bioInput: {
    minHeight: 120,
    maxHeight: 220,
  },
  bioCharacterCount: {
    alignSelf: "flex-end",
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 6,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
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
    minWidth: 100,
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
