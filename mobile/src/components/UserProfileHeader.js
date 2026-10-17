import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { AppTextInput as TextInput } from "./AppTextInput";
import { UserPresence } from "./UserPresence";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";
import * as UserAPI from "../api/users";
import { API_URL } from "../config/environment";
import { showAlert } from "../utils/showAlert";

const EDIT_FIELDS = {
  username: {
    title: "settings.changeUsername", hint: "settings.usernameHint",
    success: "settings.usernameUpdated", failure: "common.error", maxLength: 24,
  },
  displayName: {
    title: "settings.changeDisplayName", hint: "settings.displayNameHint",
    success: "settings.displayNameUpdated", failure: "common.error", maxLength: 100,
  },
  bio: {
    title: "profile.bio", hint: "profile.bioHint",
    success: "profile.bioUpdated", failure: "profile.bioUpdateFailed", maxLength: 500,
  },
};

export const UserProfileHeader = ({ user, editable = false }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [editField, setEditField] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const busy = saving || uploadingPhoto;
  const field = EDIT_FIELDS[editField];

  const openEditor = (name) => {
    setDraft(user[name] || "");
    setEditField(name);
  };
  const applyUserUpdate = (updatedUser) => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.id === user.id) updateUser({ ...currentUser, ...updatedUser });
  };
  const save = async () => {
    if (saving || !field) return;
    const value = draft.trim();
    const invalidKey = editField === "username" && !/^[a-zA-Z0-9_]{3,24}$/.test(value)
      ? "settings.usernameInvalid"
      : editField === "displayName" && (!value || value.length > 100)
        ? "settings.displayNameInvalid"
        : editField === "bio" && value.length > 500 ? "profile.bioInvalid" : null;
    if (invalidKey) {
      showAlert(t("common.error"), t(invalidKey));
      return;
    }
    setSaving(true);
    try {
      const updatedUser = await UserAPI.updateProfile({ [editField]: value }, token);
      applyUserUpdate(updatedUser);
      setEditField(null);
      showAlert(t("common.success"), t(field.success));
    } catch (error) {
      showAlert(t("common.error"), t(
        editField === "username" && error.response?.status === 409
          ? "settings.usernameTaken" : field.failure
      ));
    } finally {
      setSaving(false);
    }
  };
  const pickPhoto = async () => {
    if (busy) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert(t("common.error"), t("messages.mediaLibraryPermissionDenied"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.85,
      });
      const photo = result.assets?.[0];
      if (result.canceled || !photo?.uri) return;
      setUploadingPhoto(true);
      const uploaded = await UserAPI.uploadProfilePicture({
        uri: photo.uri, file: photo.file, fileName: `profile-${Date.now()}.jpg`,
        mimeType: photo.mimeType || "image/jpeg",
      }, token);
      applyUserUpdate(uploaded.user);
      showAlert(t("common.success"), t("profile.photoUpdated"));
    } catch (error) {
      showAlert(t("common.error"), t(error.message === "PROFILE_PHOTO_TOO_LARGE"
        ? "privacy.photoTooLarge" : "profile.photoUpdateFailed"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.avatar}>
        {user.profilePicture ? (
          <Image source={{ uri: /^(data:|blob:|https?:|file:)/.test(user.profilePicture)
            ? user.profilePicture : `${API_URL}${user.profilePicture}` }} style={styles.avatarImage} resizeMode="cover" />
        ) : <Text style={styles.avatarText}>{user.displayName?.[0] || "?"}</Text>}
      </View>
      <Text style={styles.displayName}>{user.displayName}</Text>
      <View style={styles.identityRow}>
        <Text style={styles.username}>@{user.username}</Text>
        {editable && (
          <TouchableOpacity onPress={() => openEditor("username")} disabled={busy}
            accessibilityRole="button" accessibilityLabel={t("settings.changeUsername")} style={styles.editIcon}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      {(user.bio || editable) && (
        <View style={styles.bioRow}>
          <Text style={[styles.bio, !user.bio && styles.placeholder]}>
            {user.bio || t("profile.bioHint")}
          </Text>
          {editable && (
            <TouchableOpacity onPress={() => openEditor("bio")} disabled={busy}
              accessibilityRole="button" accessibilityLabel={t(user.bio ? "profile.editBio" : "profile.addBio")}
              style={styles.editIcon}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {editable && (
        <View style={styles.editActions}>
          <TouchableOpacity style={styles.editButton} onPress={pickPhoto} disabled={busy} accessibilityRole="button">
            {uploadingPhoto ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="camera-outline" size={18} color={colors.primary} />}
            <Text style={styles.editButtonText}>{t("profile.changePhoto")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editButton} onPress={() => openEditor("displayName")}
            disabled={busy} accessibilityRole="button">
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.editButtonText}>{t("profile.changeDisplayName")}</Text>
          </TouchableOpacity>
        </View>
      )}
      <UserPresence user={user} />
      <Modal visible={Boolean(field)} transparent animationType="fade" onRequestClose={() => !saving && setEditField(null)}>
        {field && (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t(field.title)}</Text>
              <TextInput style={[styles.input, editField === "bio" && styles.bioInput]}
                value={draft} onChangeText={setDraft} placeholder={t(field.hint)} placeholderTextColor={colors.mutedText}
                autoCapitalize={editField === "displayName" ? "words" : "none"} autoCorrect={false}
                maxLength={field.maxLength} multiline={editField === "bio"}
                textAlignVertical={editField === "bio" ? "top" : "center"} editable={!saving}
                onSubmitEditing={editField === "bio" ? undefined : save} />
              {editField === "bio" && <Text style={styles.inputHint}>{draft.length}/500</Text>}
              {editField === "username" && <Text style={styles.inputHint}>{t(field.hint)}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalButton} onPress={() => setEditField(null)} disabled={saving}>
                  <Text style={styles.modalCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalPrimary]} onPress={save}
                  disabled={saving || draft.trim() === (user[editField] || "")}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalPrimaryText}>{t("common.save")}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  header: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 16,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center", marginBottom: 16, overflow: "hidden" },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" },
  displayName: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
  identityRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  username: { fontSize: 14, color: colors.secondaryText, flexShrink: 1 },
  editIcon: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  bioRow: { flexDirection: "row", alignItems: "center", marginTop: 4, maxWidth: "100%" },
  bio: { fontSize: 14, color: colors.text, lineHeight: 20, textAlign: "center", flexShrink: 1 },
  placeholder: { color: colors.mutedText },
  editActions: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 10, marginTop: 16 },
  editButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  editButtonText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  modalBackdrop: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: "rgba(0, 0, 0, 0.55)" },
  modalContent: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 16 },
  input: { color: colors.text, backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  bioInput: { minHeight: 120, maxHeight: 220 },
  inputHint: { color: colors.mutedText, fontSize: 12, marginTop: 8 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 },
  modalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 8 },
  modalPrimary: { minWidth: 100, alignItems: "center", backgroundColor: colors.primary },
  modalCancel: { color: colors.secondaryText, fontWeight: "600" },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "600" },
});
