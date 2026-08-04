import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as InvitationsAPI from "../../api/invitations";
import * as MessageAPI from "../../api/messages";
import * as UserAPI from "../../api/users";
import { SearchBar } from "../../components/SearchBar";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuthStore } from "../../store/authStore";
import { useContactStore } from "../../store/contactStore";
import { useMessageStore } from "../../store/messageStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import { copyText } from "../../utils/clipboard";
import { showAlert } from "../../utils/showAlert";

export const AddContactScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const contacts = useContactStore((state) => state.contacts);
  const addContact = useContactStore((state) => state.addContact);
  const upsertConversation = useMessageStore((state) => state.upsertConversation);
  const language = usePreferencesStore((state) => state.language);
  const [mode, setMode] = useState("invite");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [connectingUserId, setConnectingUserId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [stats, setStats] = useState({
    linksShared: 0,
    acceptedUsers: 0,
    connections: 0,
    recentConnections: 0,
  });
  const [copyStatus, setCopyStatus] = useState("idle");
  const copyStatusTimeoutRef = useRef(null);

  useEffect(() => {
    let active = true;
    InvitationsAPI.getInvitationStats(token)
      .then((nextStats) => {
        if (active) setStats(nextStats);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => () => {
    if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (mode !== "search" || normalizedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    setSearching(true);
    const timeout = setTimeout(() => {
      UserAPI.searchUsers(normalizedQuery, token)
        .then((users) => {
          if (active) setResults(users);
        })
        .catch(() => {
          if (active) showAlert(t("common.error"), t("contacts.searchFailed"));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [mode, query, token, t]);

  const shareInvitation = async (createdInvitation) => {
    await Share.share({
      title: t("contacts.shareInvitationLink"),
      message: t("settings.shareInvitation", {
        code: createdInvitation.code,
        url: createdInvitation.invitationUrl,
      }),
      url: createdInvitation.invitationUrl,
    });
  };

  const copyInvitation = async (invitationToCopy = invitation) => {
    if (copyStatusTimeoutRef.current) clearTimeout(copyStatusTimeoutRef.current);
    try {
      await copyText(invitationToCopy.invitationUrl);
      setCopyStatus("copied");
    } catch (error) {
      setCopyStatus("error");
    }
    copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus("idle"), 2000);
  };

  const showInvitationActions = (createdInvitation) => {
    setInvitation(createdInvitation);
    setStats(createdInvitation.stats);
    setCopyStatus("idle");
  };

  const handleCreateInvitation = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const createdInvitation = await InvitationsAPI.createInvitation(token, language);
      showInvitationActions(createdInvitation);
    } catch (error) {
      const serverMessage = error.response?.data?.error;
      showAlert(t("common.error"), serverMessage || t("settings.invitationFailed"));
    } finally {
      setCreating(false);
    }
  };

  const statusItems = [
    ["link-outline", stats.linksShared, t("contacts.linksShared"), "all"],
    ["person-add-outline", stats.acceptedUsers, t("contacts.acceptedUsers"), "accepted"],
    ["people-outline", stats.connections, t("contacts.totalConnections"), "connections"],
    ["time-outline", stats.recentConnections, t("contacts.recentConnections"), "recent"],
  ];

  const openFilteredInvitations = (filter) => {
    navigation.navigate("Settings", {
      screen: "MyInvitations",
      params: { filter },
    });
  };

  const existingContactIds = new Set(
    Object.values(contacts).flat().map((contact) => contact.contactUser.id)
  );

  const connectAndChat = async (user) => {
    if (connectingUserId) return;
    setConnectingUserId(user.id);
    try {
      if (!existingContactIds.has(user.id)) {
        await addContact(user.id, "All Contacts 1", null, token);
      }
      const conversation = await MessageAPI.getOrCreateDirectConversation(user.id, token);
      upsertConversation(conversation);
      navigation.navigate("Messages", {
        screen: "Chat",
        params: { conversationId: conversation.id, name: user.displayName },
      });
    } catch (error) {
      showAlert(
        t("common.error"),
        error.response?.data?.error || t("contacts.addFailed")
      );
    } finally {
      setConnectingUserId(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, mode === "search" && styles.searchContent]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.modeControl}>
        {[
          ["invite", "link-outline", t("contacts.inviteMode")],
          ["search", "search-outline", t("contacts.searchMode")],
        ].map(([value, icon, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.modeButton, mode === value && styles.modeButtonActive]}
            onPress={() => setMode(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value }}
          >
            <Ionicons name={icon} size={18} color={mode === value ? "#FFFFFF" : colors.secondaryText} />
            <Text style={[styles.modeButtonText, mode === value && styles.modeButtonTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "invite" ? (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="link" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t("contacts.createInvitationLink")}</Text>
          <Text style={styles.description}>{t("contacts.invitationLinkDescription")}</Text>

      <View style={styles.statsSection}>
        <Text style={styles.statsTitle}>{t("contacts.invitationStatsDescription")}</Text>
        <View style={styles.statusGrid}>
          {statusItems.map(([icon, value, label, filter]) => (
            <TouchableOpacity
              key={filter}
              style={styles.statusItem}
              onPress={() => openFilteredInvitations(filter)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${value}`}
            >
              <View style={styles.statusItemHeader}>
                <Ionicons name={icon} size={18} color={colors.primary} />
                <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
              </View>
              <Text style={styles.statusValue}>{value}</Text>
              <Text style={styles.statusLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, creating && styles.buttonDisabled]}
        onPress={invitation ? () => shareInvitation(invitation) : handleCreateInvitation}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name={invitation ? "share-outline" : "link-outline"}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.buttonText}>
              {t(invitation ? "contacts.shareInvitationLink" : "contacts.createInvitationLink")}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {invitation && (
        <View style={styles.linkPanel}>
          <Text style={styles.resultTitle}>{t("contacts.invitationReady")}</Text>
          <Text style={styles.code}>{invitation.code}</Text>
          <Text style={styles.link} numberOfLines={2} selectable>
            {invitation.invitationUrl}
          </Text>
          <Text style={styles.expiry}>{t("contacts.invitationExpires")}</Text>
          <TouchableOpacity
            style={[
              styles.copyButton,
              copyStatus === "copied" && styles.copyButtonCopied,
              copyStatus === "error" && styles.copyButtonError,
            ]}
            onPress={() => copyInvitation(invitation)}
          >
            <Ionicons
              name={copyStatus === "copied"
                ? "checkmark-circle"
                : copyStatus === "error" ? "alert-circle" : "copy-outline"}
              size={18}
              color={copyStatus === "copied"
                ? "#247A3E"
                : copyStatus === "error" ? colors.danger : colors.primary}
            />
            <Text style={[
              styles.copyButtonText,
              copyStatus === "copied" && styles.copyButtonTextCopied,
              copyStatus === "error" && styles.copyButtonTextError,
            ]}>
              {t(copyStatus === "copied"
                ? "contacts.copied"
                : copyStatus === "error"
                  ? "contacts.copyFailed"
                  : "contacts.copyInvitationLink")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {invitation && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setInvitation(null);
            setCopyStatus("idle");
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>{t("contacts.createAnotherLink")}</Text>
        </TouchableOpacity>
      )}
        </>
      ) : (
        <View style={styles.searchSection}>
          <Text style={styles.searchTitle}>{t("contacts.searchForUser")}</Text>
          <Text style={styles.searchDescription}>{t("contacts.publicSearchDescription")}</Text>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t("contacts.searchPlaceholder")}
            colors={colors}
            autoFocus
            rightAccessory={searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          />
          {query.trim().length > 1 && !searching && results.length === 0 && (
            <Text style={styles.emptySearch}>{t("contacts.noResults")}</Text>
          )}
          <View style={styles.resultList}>
            {results.map((user) => {
              const alreadyConnected = existingContactIds.has(user.id);
              return (
                <View key={user.id} style={styles.userRow}>
                  <TouchableOpacity
                    style={styles.userIdentity}
                    onPress={() => navigation.navigate("Profile", { userId: user.id })}
                  >
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>{user.displayName?.[0]?.toUpperCase() || "?"}</Text>
                    </View>
                    <View style={styles.userText}>
                      <Text style={styles.userName} numberOfLines={1}>{user.displayName}</Text>
                      <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={() => connectAndChat(user)}
                    disabled={Boolean(connectingUserId)}
                    accessibilityLabel={t(alreadyConnected ? "contacts.chat" : "contacts.addAndChat")}
                  >
                    {connectingUserId === user.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name={alreadyConnected ? "chatbubble-outline" : "person-add-outline"} size={19} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
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
  content: {
    flexGrow: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContent: { justifyContent: "flex-start", alignItems: "stretch" },
  modeControl: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    padding: 4,
    borderRadius: 8,
    backgroundColor: colors.input,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 6,
  },
  modeButtonActive: { backgroundColor: colors.primary },
  modeButtonText: { color: colors.secondaryText, fontSize: 14, fontWeight: "600" },
  modeButtonTextActive: { color: "#FFFFFF" },
  searchSection: { width: "100%", maxWidth: 560, alignSelf: "center" },
  searchTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  searchDescription: { color: colors.secondaryText, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  emptySearch: { color: colors.mutedText, textAlign: "center", marginTop: 32 },
  resultList: { marginTop: 12 },
  userRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userIdentity: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: colors.primary, fontSize: 17, fontWeight: "700" },
  userText: { flex: 1, marginLeft: 12 },
  userName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  username: { color: colors.secondaryText, fontSize: 13, marginTop: 2 },
  connectButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.secondaryText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
    maxWidth: 360,
  },
  linkPanel: {
    alignSelf: "stretch",
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  resultTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  code: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  link: { color: colors.primary, fontSize: 14, marginTop: 8 },
  expiry: { color: colors.mutedText, fontSize: 12, marginTop: 10 },
  copyButton: {
    minHeight: 42,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  copyButtonCopied: { borderColor: "#247A3E", backgroundColor: "#DFF4E5" },
  copyButtonError: { borderColor: colors.danger },
  copyButtonText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  copyButtonTextCopied: { color: "#247A3E" },
  copyButtonTextError: { color: colors.danger },
  button: {
    width: "100%",
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  statsSection: {
    width: "100%",
    marginBottom: 16,
  },
  statsTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  statusGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusItem: {
    width: "48%",
    minHeight: 102,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  statusItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusValue: { marginTop: 7, color: colors.text, fontSize: 24, fontWeight: "700" },
  statusLabel: { marginTop: 2, color: colors.secondaryText, fontSize: 12 },
});