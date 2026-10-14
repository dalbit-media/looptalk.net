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

export const CreateGroupScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const contacts = useContactStore((state) => state.contacts);
  const loadContacts = useContactStore((state) => state.loadContacts);
  const upsertConversation = useMessageStore((state) => state.upsertConversation);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const contactList = useMemo(() => uniqueContacts(contacts), [contacts]);

  useEffect(() => { loadContacts(token); }, [loadContacts, token]);

  const toggleContact = (userId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const createGroup = async () => {
    if (!name.trim() || selectedIds.size < 2 || creating) return;
    setCreating(true);
    try {
      const conversation = await MessagesAPI.createGroupConversation(
        name.trim(),
        [...selectedIds],
        token
      );
      upsertConversation(conversation);
      navigation.replace("Chat", { conversationId: conversation.id, name: conversation.name });
    } catch (error) {
      showAlert(t("common.error"), error.response?.data?.error || t("groups.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("groups.namePlaceholder")}
        placeholderTextColor={colors.mutedText}
        maxLength={100}
        style={styles.nameInput}
      />
      <View style={styles.selectionHeader}>
        <Text style={styles.sectionTitle}>{t("groups.chooseMembers")}</Text>
        <Text style={styles.count}>{t("groups.selectedCount", { count: selectedIds.size })}</Text>
      </View>
      <FlatList
        data={contactList}
        keyExtractor={(item) => item.contactUser.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t("groups.noContacts")}</Text>}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.contactUser.id);
          return (
            <TouchableOpacity style={styles.personRow} onPress={() => toggleContact(item.contactUser.id)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.contactUser.displayName[0].toUpperCase()}</Text></View>
              <View style={styles.personText}>
                <Text style={styles.personName}>{item.nickname || item.contactUser.displayName}</Text>
                <Text style={styles.username}>@{item.contactUser.username}</Text>
              </View>
              <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={25} color={selected ? colors.primary : colors.mutedText} />
            </TouchableOpacity>
          );
        }}
      />
      <TouchableOpacity
        style={[styles.primaryButton, (!name.trim() || selectedIds.size < 2 || creating) && styles.disabled]}
        disabled={!name.trim() || selectedIds.size < 2 || creating}
        onPress={createGroup}
      >
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t("groups.createAction")}</Text>}
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.surface },
  nameInput: { minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.input, color: colors.text, fontSize: 16 },
  selectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  count: { color: colors.secondaryText, fontSize: 13 },
  list: { flexGrow: 1 },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primary, fontWeight: "800" },
  personText: { flex: 1, marginLeft: 12 },
  personName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  username: { color: colors.mutedText, marginTop: 2, fontSize: 12 },
  empty: { color: colors.secondaryText, textAlign: "center", marginTop: 48 },
  primaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primary },
  disabled: { opacity: .45 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});