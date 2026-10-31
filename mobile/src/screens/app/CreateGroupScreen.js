import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ContactIdentity } from "../../components/ContactIdentity";
import { MemberFeatureGate } from "../../components/MemberFeatureGate";
import { SearchBar } from "../../components/SearchBar";
import { useAuthStore } from "../../store/authStore";
import { useContactStore } from "../../store/contactStore";
import { useMessageStore } from "../../store/messageStore";
import * as MessagesAPI from "../../api/messages";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { showAlert } from "../../utils/showAlert";

const getUniqueContacts = (groupedContacts) => {
  const contactsByUser = new Map();
  Object.values(groupedContacts).flat().forEach((contact) => {
    const user = contact.contactUser;
    if (!user?.id) return;
    contactsByUser.set(user.id, {
      ...user,
      displayName: contact.nickname || user.displayName,
    });
  });
  return [...contactsByUser.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
};

export const CreateGroupScreen = ({ navigation, route }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const isMember = useAuthStore((state) => state.user?.member !== false);
  const contacts = useContactStore((state) => state.contacts);
  const contactsLoading = useContactStore((state) => state.loading);
  const loadContacts = useContactStore((state) => state.loadContacts);
  const upsertConversation = useMessageStore((state) => state.upsertConversation);
  const [step, setStep] = useState(route.params?.startAtName ? "name" : "members");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState(
    () => route.params?.initialSelectedUsers || []
  );
  const [creating, setCreating] = useState(false);

  const contactList = useMemo(() => getUniqueContacts(contacts), [contacts]);
  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return contactList;
    return contactList.filter((contact) =>
      [contact.displayName, contact.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [contactList, query]);
  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers]
  );

  useEffect(() => {
    if (isMember) loadContacts(token);
  }, [isMember, loadContacts, token]);

  const toggleUser = (user) => {
    setSelectedUsers((current) =>
      selectedIds.has(user.id)
        ? current.filter((selectedUser) => selectedUser.id !== user.id)
        : [...current, user]
    );
  };

  const createGroup = async () => {
    const normalizedName = name.trim();
    if (!normalizedName || selectedUsers.length < 2 || creating) return;
    setCreating(true);
    try {
      const conversation = await MessagesAPI.createGroupConversation(
        normalizedName,
        selectedUsers.map((user) => user.id),
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

  const startDirectChat = async () => {
    const [selectedUser] = selectedUsers;
    if (!selectedUser || creating) return;
    setCreating(true);
    try {
      const conversation = await MessagesAPI.getOrCreateDirectConversation(
        selectedUser.id,
        token
      );
      upsertConversation(conversation);
      navigation.replace("Chat", {
        conversationId: conversation.id,
        name: selectedUser.displayName,
      });
    } catch (error) {
      showAlert(t("common.error"), error.response?.data?.error || t("contacts.addFailed"));
    } finally {
      setCreating(false);
    }
  };

  if (!isMember) {
    return (
      <View style={[styles.container, styles.gateContainer]}>
        <MemberFeatureGate
          message="memberAccess.newMessages"
          onJoinNetwork={() => navigation.navigate("Forum", { screen: "JoinNetwork" })}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {step === "members" ? (
        <>
          <View style={styles.selectionHeader}>
            <Text style={styles.sectionTitle}>{t("groups.chooseMembers")}</Text>
            <Text style={styles.count}>{t("groups.selectedCount", { count: selectedUsers.length })}</Text>
          </View>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t("groups.searchUsersPlaceholder")}
            colors={colors}
            autoFocus
          />
          {selectedUsers.length > 0 && (
            <View style={styles.selectedList}>
              {selectedUsers.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={styles.selectedUser}
                  onPress={() => toggleUser(user)}
                  accessibilityRole="button"
                  accessibilityLabel={t("groups.removeSelectedUser", { name: user.displayName })}
                >
                  <Text style={styles.selectedUserName} numberOfLines={1}>
                    {user.displayName}
                  </Text>
                  <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <FlatList
            data={filteredContacts}
            keyExtractor={(contact) => contact.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              contactsLoading ? (
                <ActivityIndicator style={styles.empty} size="large" color={colors.primary} />
              ) : (
                <Text style={styles.empty}>
                  {query.trim() ? t("contacts.noResults") : t("groups.noContacts")}
                </Text>
              )
            }
            renderItem={({ item }) => {
              const selected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  style={styles.personRow}
                  onPress={() => toggleUser(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <ContactIdentity
                    user={item}
                    searchQuery={query}
                    colors={colors}
                  />
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={25}
                    color={selected ? colors.primary : colors.mutedText}
                  />
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            style={[styles.primaryButton, selectedUsers.length < 1 && styles.disabled]}
            disabled={selectedUsers.length < 1}
            onPress={selectedUsers.length === 1 ? startDirectChat : () => setStep("name")}
            accessibilityRole="button"
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {t(selectedUsers.length === 1 ? "messages.startDirectChat" : "groups.continueToName")}
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.selectionHeader}>
            <Text style={styles.sectionTitle}>{t("groups.nameStep")}</Text>
            <TouchableOpacity
              style={styles.changeMembersButton}
              onPress={() => setStep("members")}
              accessibilityRole="button"
            >
              <Ionicons name="pencil-outline" size={16} color={colors.primary} />
              <Text style={styles.changeMembersText}>{t("groups.changeMembers")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.count}>
            {t("groups.selectedCount", { count: selectedUsers.length })}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("groups.namePlaceholder")}
            placeholderTextColor={colors.mutedText}
            maxLength={100}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={createGroup}
            style={styles.nameInput}
          />
          <View style={styles.spacer} />
          <TouchableOpacity
            style={[styles.primaryButton, (!name.trim() || creating) && styles.disabled]}
            disabled={!name.trim() || creating}
            onPress={createGroup}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{t("groups.createAction")}</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.surface },
  gateContainer: { justifyContent: "center", alignItems: "center" },
  selectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  count: { color: colors.secondaryText, fontSize: 13 },
  selectedList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  selectedUser: { maxWidth: "100%", minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.input },
  selectedUserName: { maxWidth: 180, color: colors.text, fontSize: 13 },
  list: { flexGrow: 1, paddingTop: 8 },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  empty: { color: colors.secondaryText, textAlign: "center", marginTop: 32, marginBottom: 16 },
  nameInput: { minHeight: 52, marginTop: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.input, color: colors.text, fontSize: 16 },
  changeMembersButton: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  changeMembersText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  spacer: { flex: 1 },
  primaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.action },
  disabled: { opacity: .45 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
