import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from "react-native";
import { AppText as Text } from "../../components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyState } from "../../components/EmptyState";
import { SearchBar } from "../../components/SearchBar";
import { FilterDropdown } from "../../components/FilterDropdown";
import { HighlightText } from "../../components/HighlightText";
import { UserPresence } from "../../components/UserPresence";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useContactStore } from "../../store/contactStore";
import { contactDisplayNames, resolveDisplayName } from "../../utils/contactDisplayName";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { API_URL } from "../../config/environment";

const getPeerName = (conversation, userId, names) => {
  if (conversation.isGroupChat) return null;
  const peer = conversation.participants?.find(
    (participant) => participant.user?.id !== userId
  )?.user;
  return resolveDisplayName(names, peer) || null;
};

const getMessagePreview = (message, t) => {
  if (!message) return t("messages.noMessagesYet");
  if (message.deletedAt) return t("messages.messageDeleted");
  if (message.content) return message.content;
  if (message.messageType === "FILE") return message.fileName || t("messages.file");
  if (message.messageType === "IMAGE" || message.messageType === "DRAWING") return t("messages.imageCaption");
  if (message.messageType === "VIDEO") return t("messages.videoCaption");
  if (message.messageType === "VOICE") return t("messages.voiceCaption");
  return t("messages.noMessagesYet");
};

export const MessagesScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isMember = user?.member !== false;
  const conversations = useMessageStore((state) => state.conversations);
  const contacts = useContactStore((state) => state.contacts);
  const names = useMemo(() => contactDisplayNames(contacts), [contacts]);
  const onlineUsers = useMessageStore((state) => state.onlineUsers);
  const presenceConnected = useMessageStore((state) => state.presenceConnected);
  const loading = useMessageStore((state) => state.loading);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKey, setFilterKey] = useState("all");

  const filterOptions = [
    { key: "all", label: t("messages.filterAll") },
    { key: "unread", label: t("messages.filterUnread") },
  ];

  const getConversationTitle = (conversation) =>
    conversation.name || getPeerName(conversation, user.id, names) || t("messages.unnamedChat");

  const filteredConversations = useMemo(() => {
    const query = isMember ? searchQuery.trim().toLowerCase() : "";
    return conversations.filter((conversation) => {
      if (isMember && filterKey === "unread" && !(conversation.unreadCount > 0)) return false;
      if (!query) return true;
      const title = getConversationTitle(conversation).toLowerCase();
      const lastMessageText = (conversation.messages?.[0]?.content || "").toLowerCase();
      const participantNames = (conversation.participants || [])
        .map((participant) => [
          resolveDisplayName(names, participant.user, participant.userId),
          participant.user?.username,
        ].filter(Boolean).join(" ").toLowerCase())
        .join(" ");
      return (
        title.includes(query) ||
        lastMessageText.includes(query) ||
        participantNames.includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, searchQuery, filterKey, user.id, names, isMember]);

  const loadConversations = useMessageStore((state) => state.loadConversations);

  useEffect(() => {
    loadConversations(token, user.id);
    const interval = setInterval(() => {
      loadConversations(token, user.id);
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [token, user.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations(token, user.id);
    setRefreshing(false);
  };

  const handlePressConversation = (conversation) => {
    navigation.navigate("Chat", {
      conversationId: conversation.id,
      name: getConversationTitle(conversation),
    });
  };

  const renderConversationItem = ({ item }) => {
    const lastMessage = item.messages?.[0];
    const subtitle = getMessagePreview(lastMessage, t);
    const timestamp = lastMessage
      ? new Date(lastMessage.createdAt).toLocaleDateString()
      : "";
    const title = getConversationTitle(item);
    const peerUser = item.participants?.find(
      (participant) => participant.user?.id !== user.id
    )?.user;
    const peerAvatarUri = peerUser?.profilePicture
      ? `${API_URL}${peerUser.profilePicture}`
      : null;
    const peerName = resolveDisplayName(names, peerUser);
    const isPeerOnline = presenceConnected && item.participants?.some(
      (participant) =>
        participant.userId !== user.id && onlineUsers.has(participant.userId)
    );

    return (
      <View style={styles.conversationItem}>
        <TouchableOpacity
          style={styles.conversationTouchable}
          onPress={() => handlePressConversation(item)}
          activeOpacity={0.7}
        >
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={(event) => {
              event.stopPropagation();
              if (peerUser?.id) {
                navigation.navigate("Profile", { userId: peerUser.id, name: peerName });
              }
            }}
            disabled={!peerUser?.id || item.isGroupChat}
            accessibilityRole="button"
            accessibilityLabel={peerName
              ? t("profile.viewProfile", { name: peerName })
              : t("navigation.profile")}
          >
            <View style={styles.avatar}>
              {peerAvatarUri ? (
                <Image source={{ uri: peerAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>
                  {title[0].toUpperCase()}
                </Text>
              )}
            </View>
            {isPeerOnline && <View style={styles.onlineIndicator} />}
          </TouchableOpacity>

          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <HighlightText
                text={title}
                query={searchQuery}
                style={styles.conversationName}
                numberOfLines={1}
              />
              <Text style={styles.timestamp}>{timestamp}</Text>
            </View>
            <HighlightText
              text={subtitle}
              query={searchQuery}
              style={styles.lastMessage}
              numberOfLines={1}
            />
            {!item.isGroupChat && peerUser && <UserPresence user={peerUser} compact />}
          </View>

          {item.unreadCount > 0 && (
            <View
              style={styles.unreadBadge}
              accessibilityLabel={t("messages.unreadCount", { count: item.unreadCount })}
            >
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const ListEmptyComponent = () =>
    isMember && (searchQuery.trim() || filterKey !== "all") ? (
      <EmptyState
        icon="search-outline"
        title={t("messages.noResults")}
        message=""
      />
    ) : (
      <EmptyState
        icon="chatbubble-outline"
        title={t("messages.noMessages")}
        message={t("messages.emptySubtitle")}
      />
    );

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <SearchBar
          value={isMember ? searchQuery : ""}
          onChangeText={setSearchQuery}
          placeholder={t("messages.searchPlaceholder")}
          colors={colors}
          style={styles.searchBarFlex}
          disabled={!isMember}
          accessibilityHint={!isMember ? t("memberAccess.chatSearch") : undefined}
        />
        <FilterDropdown
          options={filterOptions}
          selectedKey={isMember ? filterKey : "all"}
          onSelect={setFilterKey}
          colors={colors}
          disabled={!isMember}
          accessibilityHint={!isMember ? t("memberAccess.chatSearch") : undefined}
        />
      </View>
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={ListEmptyComponent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
      {isMember && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("CreateGroup")}
          accessibilityRole="button"
          accessibilityLabel={t("messages.newMessage")}
        >
          <Ionicons name="create-outline" size={25} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  searchBarFlex: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.action,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  conversationItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  conversationTouchable: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  onlineIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.online,
    position: "absolute",
    bottom: 0,
    right: 0,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: colors.mutedText,
    marginLeft: 8,
  },
  lastMessage: {
    fontSize: 14,
    color: colors.secondaryText,
  },
  unreadBadge: {
    marginLeft: 8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.unreadBadge,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadText: {
    color: colors.onUnreadBadge,
    fontSize: 12,
    fontWeight: "600",
  },
});
