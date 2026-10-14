import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Animated,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyState } from "../../components/EmptyState";
import { SearchBar } from "../../components/SearchBar";
import { FilterDropdown } from "../../components/FilterDropdown";
import { HighlightText } from "../../components/HighlightText";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";

const getPeerName = (conversation, userId) => {
  if (conversation.isGroupChat) return null;
  const peer = conversation.participants?.find(
    (participant) => participant.user?.id !== userId
  )?.user;
  return peer?.displayName || null;
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
  const conversations = useMessageStore((state) => state.conversations);
  const loading = useMessageStore((state) => state.loading);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const scaleAnim = new Animated.Value(1);

  const filterOptions = [
    { key: "all", label: t("messages.filterAll") },
    { key: "unread", label: t("messages.filterUnread") },
  ];

  const getConversationTitle = (conversation) =>
    conversation.name || getPeerName(conversation, user.id) || t("messages.unnamedChat");

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filterKey === "unread" && !(conversation.unreadCount > 0)) return false;
      if (!query) return true;
      const title = getConversationTitle(conversation).toLowerCase();
      const lastMessageText = (conversation.messages?.[0]?.content || "").toLowerCase();
      const participantNames = (conversation.participants || [])
        .map((participant) => participant.user?.displayName?.toLowerCase() || "")
        .join(" ");
      return (
        title.includes(query) ||
        lastMessageText.includes(query) ||
        participantNames.includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, searchQuery, filterKey, user.id]);

  const loadConversations = useMessageStore((state) => state.loadConversations);

  useEffect(() => {
    loadConversations(token, user.id);
    const interval = setInterval(() => {
      loadConversations(token, user.id);
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [token, user.id]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("CreateGroup")}
          accessibilityRole="button"
          accessibilityLabel={t("groups.create")}
          style={styles.headerButton}
        >
          <Ionicons name="people-circle-outline" size={27} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, t, colors.primary]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations(token, user.id);
    setRefreshing(false);
  };

  const handlePressConversation = (conversation) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      navigation.navigate("Chat", {
        conversationId: conversation.id,
        name: getConversationTitle(conversation),
      });
    });
  };

  const renderConversationItem = ({ item }) => {
    const lastMessage = item.messages?.[0];
    const subtitle = getMessagePreview(lastMessage, t);
    const timestamp = lastMessage
      ? new Date(lastMessage.createdAt).toLocaleDateString()
      : "";
    const title = getConversationTitle(item);

    return (
      <Animated.View
        style={[
          styles.conversationItem,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.conversationTouchable}
          onPress={() => handlePressConversation(item)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {title[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.onlineIndicator} />
          </View>

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
          </View>

          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 0 ? item.unreadCount : ""}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const ListEmptyComponent = () =>
    searchQuery.trim() || filterKey !== "all" ? (
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
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("messages.searchPlaceholder")}
          colors={colors}
          style={styles.searchBarFlex}
        />
        <FilterDropdown
          options={filterOptions}
          selectedKey={filterKey}
          onSelect={setFilterKey}
          colors={colors}
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
  headerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
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
    backgroundColor: "#31a24c",
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
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
