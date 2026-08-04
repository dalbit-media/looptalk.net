import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useContactStore } from "../../store/contactStore";
import { useMessageStore } from "../../store/messageStore";
import * as MessagesAPI from "../../api/messages";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { showAlert } from "../../utils/showAlert";

const uniqueContacts = (groupedContacts) => {
  const contactsByUser = new Map();
  Object.values(groupedContacts).flat().forEach((contact) => {
    if (contact.contactUser?.id) contactsByUser.set(contact.contactUser.id, contact);
  });
  return [...contactsByUser.values()];
};

export const GroupInfoScreen = ({ route, navigation }) => {
  const { conversationId } = route.params;
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const contacts = useContactStore((state) => state.contacts);
  const loadContacts = useContactStore((state) => state.loadContacts);
  const storedConversation = useMessageStore((state) => state.conversations.find((item) => item.id === conversationId));
  const upsertConversation = useMessageStore((state) => state.upsertConversation);
  const removeConversation = useMessageStore((state) => state.removeConversation);
  const [conversation, setConversation] = useState(storedConversation);
  const [name, setName] = useState(storedConversation?.name || "");
  const [busy, setBusy] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const currentParticipant = conversation?.participants?.find(
    (participant) => participant.userId === currentUser.id
  );
  const canManage = ["OWNER", "ADMIN"].includes(currentParticipant?.role);
  const isOwner = currentParticipant?.role === "OWNER";

  useEffect(() => {
    Promise.all([MessagesAPI.getConversation(conversationId, token), loadContacts(token)])
      .then(([details]) => { setConversation(details); setName(details.name || ""); upsertConversation(details); })
      .catch(() => showAlert(t("common.error"), t("groups.loadFailed")));
  }, [conversationId, loadContacts, token, upsertConversation]);

  const availableContacts = useMemo(() => {
    const memberIds = new Set((conversation?.participants || []).map((item) => item.userId));
    return uniqueContacts(contacts).filter((contact) => !memberIds.has(contact.contactUser.id));
  }, [contacts, conversation?.participants]);

  const saveName = async () => {
    if (!name.trim() || name.trim() === conversation?.name || busy) return;
    setBusy(true);
    try {
      const updated = await MessagesAPI.renameGroupConversation(conversationId, name.trim(), token);
      setConversation(updated);
      upsertConversation(updated);
      navigation.setParams({ name: updated.name });
    } catch (error) {
      showAlert(t("common.error"), error.response?.data?.error || t("groups.renameFailed"));
    } finally { setBusy(false); }
  };

  const addMember = async (userId) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await MessagesAPI.addGroupMember(conversationId, userId, token);
      setConversation(updated);
      upsertConversation(updated);
    } catch (error) {
      showAlert(t("common.error"), error.response?.data?.error || t("groups.addFailed"));
    } finally { setBusy(false); }
  };

  const updateMemberRole = async (member, role) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await MessagesAPI.updateGroupMemberRole(
        conversationId,
        member.userId,
        role,
        token
      );
      setConversation(updated);
      upsertConversation(updated);
    } catch (error) {
      showAlert(t("common.error"), error.response?.data?.error || t("groups.roleFailed"));
    } finally { setBusy(false); }
  };

  const removeMember = (member) => showAlert(
    t("groups.removeMember"),
    t("groups.removeConfirm", { name: member.user.displayName }),
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("groups.removeMember"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await MessagesAPI.removeGroupMember(
              conversationId,
              member.userId,
              token
            );
            setConversation(updated);
            upsertConversation(updated);
          } catch (error) {
            showAlert(t("common.error"), error.response?.data?.error || t("groups.removeFailed"));
          } finally { setBusy(false); }
        },
      },
    ]
  );

  const manageMember = (member) => {
    const actions = [];
    if (isOwner && member.role !== "OWNER") {
      actions.push({
        text: t(member.role === "ADMIN" ? "groups.removeAdmin" : "groups.makeAdmin"),
        onPress: () => updateMemberRole(member, member.role === "ADMIN" ? "MEMBER" : "ADMIN"),
      });
    }
    if (
      member.role !== "OWNER" &&
      (isOwner || (currentParticipant?.role === "ADMIN" && member.role === "MEMBER"))
    ) {
      actions.push({
        text: t("groups.removeMember"),
        style: "destructive",
        onPress: () => removeMember(member),
      });
    }
    actions.push({ text: t("common.cancel"), style: "cancel" });
    showAlert(member.user.displayName, undefined, actions);
  };

  const leaveGroup = () => showAlert(t("groups.leave"), t("groups.leaveConfirm"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("groups.leave"), style: "destructive", onPress: async () => {
        try {
          await MessagesAPI.leaveGroupConversation(conversationId, token);
          removeConversation(conversationId);
          navigation.popToTop();
        } catch { showAlert(t("common.error"), t("groups.leaveFailed")); }
      },
    },
  ]);

  if (!conversation) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.renameRow}>
        <TextInput value={name} onChangeText={setName} maxLength={100} style={styles.nameInput} editable={canManage} />
        {canManage && <TouchableOpacity style={styles.iconButton} onPress={saveName} disabled={busy || !name.trim() || name.trim() === conversation.name}>
          <Ionicons name="checkmark" size={24} color={name.trim() && name.trim() !== conversation.name ? colors.primary : colors.mutedText} />
        </TouchableOpacity>}
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("groups.members", { count: conversation.participants.length })}</Text>
        {canManage && <TouchableOpacity onPress={() => setShowAddMembers((value) => !value)} style={styles.addButton}>
          <Ionicons name={showAddMembers ? "close" : "person-add-outline"} size={20} color={colors.primary} />
          <Text style={styles.addText}>{showAddMembers ? t("common.cancel") : t("groups.addMembers")}</Text>
        </TouchableOpacity>}
      </View>
      {showAddMembers ? (
        <FlatList
          data={availableContacts}
          keyExtractor={(item) => item.contactUser.id}
          ListEmptyComponent={<Text style={styles.empty}>{t("groups.everyoneAdded")}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.personRow} onPress={() => addMember(item.contactUser.id)} disabled={busy}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.contactUser.displayName[0].toUpperCase()}</Text></View>
              <Text style={styles.personName}>{item.nickname || item.contactUser.displayName}</Text>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={conversation.participants}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <View style={styles.personRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.user.displayName[0].toUpperCase()}</Text></View>
              <View style={styles.personInfo}>
                <Text style={styles.personName}>{item.user.displayName}{item.userId === currentUser.id ? ` (${t("groups.you")})` : ""}</Text>
                <Text style={styles.username}>@{item.user.username}</Text>
              </View>
              {item.role && item.role !== "MEMBER" && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{t(`groups.role.${item.role.toLowerCase()}`)}</Text>
                </View>
              )}
              {item.userId !== currentUser.id && canManage && item.role !== "OWNER" && (
                <TouchableOpacity style={styles.memberMenu} onPress={() => manageMember(item)} disabled={busy} accessibilityLabel={t("groups.manageMember")}>
                  <Ionicons name="ellipsis-horizontal" size={21} color={colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
      <TouchableOpacity style={styles.leaveButton} onPress={leaveGroup}>
        <Ionicons name="exit-outline" size={21} color={colors.danger} />
        <Text style={styles.leaveText}>{t("groups.leave")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  renameRow: { flexDirection: "row", gap: 8 },
  nameInput: { flex: 1, minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.input, color: colors.text, fontSize: 17, fontWeight: "600" },
  iconButton: { width: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  sectionHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  addButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  addText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  personRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primary, fontWeight: "800" },
  personName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  personInfo: { flex: 1 },
  username: { color: colors.mutedText, marginTop: 2, fontSize: 12 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primarySoft },
  roleText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  memberMenu: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.secondaryText, textAlign: "center", marginTop: 48 },
  leaveButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  leaveText: { color: colors.danger, fontSize: 15, fontWeight: "700" },
});