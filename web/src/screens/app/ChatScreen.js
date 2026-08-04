import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyState } from "../../components/EmptyState";
import { AttachmentSheet } from "../../components/AttachmentSheet";
import { DrawingPad } from "../../components/DrawingPad";
import { VoiceRecorderBar } from "../../components/VoiceRecorderBar";
import { VoiceMessageBubble } from "../../components/VoiceMessageBubble";
import { VideoMessageBubble } from "../../components/VideoMessageBubble";
import { SearchBar } from "../../components/SearchBar";
import { FilterChips } from "../../components/FilterChips";
import { HighlightText } from "../../components/HighlightText";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useCallStore } from "../../store/callStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { showAlert } from "../../utils/showAlert";
import * as ReportAPI from "../../api/reports";

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ChatScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const { conversationId } = route.params;
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const messages = useMessageStore((state) => state.messages);
  const conversations = useMessageStore((state) => state.conversations);
  const loadMessages = useMessageStore((state) => state.loadMessages);
  const sendMessage = useMessageStore((state) => state.sendMessage);
  const retryMessage = useMessageStore((state) => state.retryMessage);
  const sendMediaMessage = useMessageStore((state) => state.sendMediaMessage);
  const reactToMessage = useMessageStore((state) => state.reactToMessage);
  const editMessage = useMessageStore((state) => state.editMessage);
  const deleteMessage = useMessageStore((state) => state.deleteMessage);
  const joinConversation = useMessageStore((state) => state.joinConversation);
  const leaveConversation = useMessageStore((state) => state.leaveConversation);
  const setTyping = useMessageStore((state) => state.setTyping);
  const stopTyping = useMessageStore((state) => state.stopTyping);
  const typingUsers = useMessageStore((state) => state.typingUsers);
  const loadingOlderMessages = useMessageStore((state) => state.loadingOlderMessages);
  const hasOlderMessages = useMessageStore((state) => state.hasOlderMessages);
  const loadOlderMessages = useMessageStore((state) => state.loadOlderMessages);

  const isCallingSupported = useCallStore((state) => state.isCallingSupported);
  const isVideoCallingSupported = useCallStore(
    (state) => state.isVideoCallingSupported
  );
  const startCall = useCallStore((state) => state.startCall);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [drawingVisible, setDrawingVisible] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState("all");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  const conversation = conversations.find((item) => item.id === conversationId);
  const peerUser =
    conversation && !conversation.isGroupChat
      ? conversation.participants?.find((participant) => participant.userId !== user.id)
          ?.user
      : null;
  const canCall = isCallingSupported && !!peerUser;
  const canVideoCall = canCall && isVideoCallingSupported;

  const matches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return messages.filter((message) => {
      if (message.deletedAt) return false;
      if (searchFilter === "text" && message.messageType !== "TEXT") return false;
      if (searchFilter === "media" && message.messageType === "TEXT") return false;
      const haystack = [
        message.content,
        message.sender?.displayName,
        message.sender?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [messages, searchQuery, searchFilter]);

  const requestScrollToIndex = (index, attempt = 0) => {
    if (!flatListRef.current || index < 0) return;
    try {
      flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch (error) {
      if (attempt < 3) {
        setTimeout(() => requestScrollToIndex(index, attempt + 1), 150);
      }
    }
  };

  const goToMatch = (targetIndex) => {
    if (!matches.length) return;
    const nextIndex = ((targetIndex % matches.length) + matches.length) % matches.length;
    setCurrentMatchIndex(nextIndex);
    const dataIndex = messages.findIndex((message) => message.id === matches[nextIndex].id);
    requestScrollToIndex(dataIndex);
  };

  useEffect(() => {
    if (!searchActive) return;
    setCurrentMatchIndex(0);
    if (matches.length > 0) {
      const dataIndex = messages.findIndex((message) => message.id === matches[0].id);
      requestScrollToIndex(dataIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchFilter, searchActive]);

  const handleCloseSearch = () => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchFilter("all");
    setCurrentMatchIndex(0);
  };

  useEffect(() => {
    navigation.setOptions({
      title: conversation?.name || route.params?.name || t("messages.chat"),
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setSearchActive((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={t("messages.searchInConversation")}
          >
            <Ionicons name="search" size={22} color={colors.primary} />
          </TouchableOpacity>
          {canCall && (
            <>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => handleStartCall("audio")}
                accessibilityRole="button"
                accessibilityLabel={t("calls.startAudioCall")}
              >
                <Ionicons name="call" size={22} color={colors.primary} />
              </TouchableOpacity>
              {canVideoCall && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => handleStartCall("video")}
                  accessibilityRole="button"
                  accessibilityLabel={t("calls.startVideoCall")}
                >
                  <Ionicons name="videocam" size={22} color={colors.primary} />
                </TouchableOpacity>
              )}
            </>
          )}
          {conversation?.isGroupChat && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate("GroupInfo", { conversationId })}
              accessibilityRole="button"
              accessibilityLabel={t("groups.info")}
            >
              <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, canCall, canVideoCall, peerUser?.id, conversation?.isGroupChat]);

  useEffect(() => {
    loadMessages(conversationId, user.id, token);
    joinConversation(conversationId);

    return () => {
      stopTyping(conversationId, user.id);
      leaveConversation(conversationId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId, user.id, token, joinConversation, leaveConversation, loadMessages]);

  useEffect(() => {
    if (!searchActive) scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0 && !searchActive) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  const handleStartCall = async (callType) => {
    if (!peerUser) return;
    try {
      await startCall(conversationId, callType, peerUser);
    } catch (error) {
      console.error("Error starting call:", error);
      showAlert(t("common.error"), t("calls.callFailed"));
    }
  };

  const handleTyping = (text) => {
    setMessageText(text);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!text.trim()) {
      stopTyping(conversationId, user.id);
      return;
    }

    setTyping(conversationId, user.id, user.displayName);

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(conversationId, user.id);
    }, 3000);
  };

  const handleSendMessage = async () => {
    if (sending || !messageText.trim()) return;

    const text = messageText.trim();
    setSending(true);

    try {
      if (editTarget) {
        await editMessage(conversationId, editTarget.id, text, token);
        setMessageText("");
        setEditTarget(null);
      } else {
        const replyToId = replyTarget?.id;
        setMessageText("");
        setReplyTarget(null);
        await sendMessage(conversationId, text, token, replyToId);
        stopTyping(conversationId, user.id);
      }
    } catch (error) {
      if (editTarget) setMessageText(text);
      showAlert(
        t("common.error"),
        t(editTarget ? "messages.editFailed" : "messages.sendFailed")
      );
    } finally {
      setSending(false);
    }
  };

  const uploadMedia = async (payload) => {
    setUploadingMedia(true);
    try {
      await sendMediaMessage(conversationId, payload, token);
    } catch (error) {
      console.error("Error sending media message:", error);
      showAlert(t("common.error"), t("messages.mediaUploadFailed"));
    } finally {
      setUploadingMedia(false);
    }
  };

  const guessMimeType = (uri, fallback) => {
    const extension = uri.split(".").pop()?.toLowerCase();
    const map = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      m4a: "audio/m4a",
      wav: "audio/wav",
    };
    return map[extension] || fallback;
  };

  const handlePickFromLibrary = async () => {
    setAttachmentSheetVisible(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(t("common.error"), t("messages.mediaLibraryPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.9,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets?.length) return;
    await handlePickedAsset(result.assets[0]);
  };

  const handleTakePhotoOrVideo = async () => {
    setAttachmentSheetVisible(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert(t("common.error"), t("messages.cameraPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.9,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets?.length) return;
    await handlePickedAsset(result.assets[0]);
  };

  const handlePickedAsset = async (asset) => {
    const isVideo = asset.type === "video" || asset.duration != null;
    const name = asset.fileName || (isVideo ? "video.mp4" : "photo.jpg");
    const mimeType = asset.mimeType || guessMimeType(asset.uri, isVideo ? "video/mp4" : "image/jpeg");

    let thumbnailUri;
    let thumbnailMimeType;
    if (isVideo) {
      try {
        const thumbnail = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 });
        thumbnailUri = thumbnail.uri;
        thumbnailMimeType = "image/jpeg";
      } catch (error) {
        console.error("Error generating video thumbnail:", error);
      }
    }

    await uploadMedia({
      uri: asset.uri,
      name,
      mimeType,
      messageType: isVideo ? "VIDEO" : "IMAGE",
      width: asset.width,
      height: asset.height,
      duration: isVideo && asset.duration ? Math.round(asset.duration) : null,
      thumbnailUri,
      thumbnailMimeType,
    });
  };

  const handleVoiceCancel = (message) => {
    setRecordingVoice(false);
    if (message) showAlert(t("common.error"), message);
  };

  const handleVoiceSend = async (uri, durationMs) => {
    setRecordingVoice(false);
    if (!uri) return;
    await uploadMedia({
      uri,
      name: "voice-message.m4a",
      mimeType: guessMimeType(uri, "audio/m4a"),
      messageType: "VOICE",
      duration: durationMs,
    });
  };

  const handleDrawingSend = async (uri) => {
    setDrawingVisible(false);
    await uploadMedia({
      uri,
      name: "drawing.png",
      mimeType: "image/png",
      messageType: "DRAWING",
    });
  };

  const handlePickFile = async () => {
    setAttachmentSheetVisible(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const file = result.assets[0];
    await uploadMedia({
      uri: file.uri,
      name: file.name || "file",
      mimeType: file.mimeType || "application/octet-stream",
      messageType: "FILE",
      fileName: file.name || "file",
      fileSize: file.size,
    });
  };

  const handleAttachmentSelect = (key) => {
    if (key === "camera") {
      handleTakePhotoOrVideo();
    } else if (key === "library") {
      handlePickFromLibrary();
    } else if (key === "file") {
      handlePickFile();
    } else if (key === "voice") {
      setAttachmentSheetVisible(false);
      setRecordingVoice(true);
    } else if (key === "drawing") {
      setAttachmentSheetVisible(false);
      setDrawingVisible(true);
    }
  };

  const handleOpenLink = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      showAlert(t("common.error"), t("messages.openLinkFailed"));
    });
  };

  const handleReactPress = (item) => {
    showAlert(
      t("messages.react"),
      undefined,
      [
        ...REACTION_EMOJIS.map((emoji) => ({
          text: emoji,
          onPress: async () => {
            try {
              await reactToMessage(conversationId, item.id, emoji, token);
            } catch (error) {
              showAlert(t("common.error"), t("messages.reactFailed"));
            }
          },
        })),
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
  };

  const handleEditPress = (item) => {
    setReplyTarget(null);
    setEditTarget(item);
    setMessageText(item.content || "");
  };

  const handleDeletePress = (item) => {
    showAlert(
      t("messages.deleteConfirmTitle"),
      t("messages.deleteConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMessage(conversationId, item.id, token);
            } catch (error) {
              showAlert(t("common.error"), t("messages.deleteFailed"));
            }
          },
        },
      ]
    );
  };

  const handleReportMessage = (item) => {
    const categories = ["SPAM", "HARASSMENT", "HATE", "SEXUAL_CONTENT", "VIOLENCE", "OTHER"];
    showAlert(t("reports.reportMessage"), t("reports.chooseReason"), [
      ...categories.map((category) => ({
        text: t(`reports.category.${category}`),
        onPress: async () => {
          try {
            await ReportAPI.submitReport({ messageId: item.id, category }, token);
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

  const handleMessageLongPress = (item) => {
    if (item.deletedAt || item.deliveryState) return;
    const isOwn = item.senderId === user.id;
    const buttons = [{ text: t("messages.react"), onPress: () => handleReactPress(item) }];
    if (item.messageType === "TEXT") {
      buttons.push({
        text: t("messages.reply"),
        onPress: () => {
          setEditTarget(null);
          setReplyTarget(item);
        },
      });
    }
    if (isOwn && item.messageType === "TEXT") {
      buttons.push({ text: t("common.edit"), onPress: () => handleEditPress(item) });
    }
    if (isOwn) {
      buttons.push({
        text: t("common.delete"),
        style: "destructive",
        onPress: () => handleDeletePress(item),
      });
    } else {
      buttons.push({
        text: t("reports.reportMessage"),
        style: "destructive",
        onPress: () => handleReportMessage(item),
      });
    }
    buttons.push({ text: t("common.cancel"), style: "cancel" });
    showAlert("", undefined, buttons);
  };

  const handleRetryMessage = async (item) => {
    if (item.deliveryState !== "failed" || !item.clientMessageId) return;
    try {
      await retryMessage(item.clientMessageId, token);
    } catch (error) {
      showAlert(t("common.error"), t("messages.sendFailed"));
    }
  };

  const renderMessageItem = ({ item }) => {
    if (item.messageType === "SYSTEM") {
      return (
        <View style={styles.systemMessageRow}>
          <Text style={styles.systemMessageText}>{item.content}</Text>
          <Text style={styles.systemMessageTime}>
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      );
    }

    const isOwn = item.senderId === user.id;
    const senderName =
      item.sender?.displayName || item.sender?.username || "Unknown user";
    const isCurrentMatch =
      searchActive && matches.length > 0 && matches[currentMatchIndex]?.id === item.id;
    const isMatch = searchActive && matches.some((match) => match.id === item.id);
    const highlightQuery = searchActive ? searchQuery : "";
    const readRecipients = isOwn && !item.deliveryState
      ? (conversation?.participants || []).filter((participant) =>
          participant.userId !== user.id &&
          (!participant.joinedAt || new Date(participant.joinedAt) <= new Date(item.createdAt))
        )
      : [];
    const readCount = readRecipients.filter((participant) =>
      participant.lastReadAt && new Date(participant.lastReadAt) >= new Date(item.createdAt)
    ).length;
    const readStatus = readRecipients.length
      ? conversation?.isGroupChat
        ? t("messages.readByCount", { count: readCount, total: readRecipients.length })
        : t(readCount === readRecipients.length ? "messages.read" : "messages.sent")
      : null;

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.ownMessageRow : styles.otherMessageRow,
        ]}
      >
        {!isOwn && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{senderName[0]}</Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleRetryMessage(item)}
          onLongPress={() => handleMessageLongPress(item)}
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            isMatch && styles.matchedBubble,
            isCurrentMatch && styles.currentMatchBubble,
          ]}
        >
          {!isOwn && (
            <HighlightText
              text={senderName}
              query={highlightQuery}
              active={isCurrentMatch}
              style={styles.senderName}
            />
          )}

          {item.deletedAt ? (
            <Text style={[styles.messageText, styles.deletedText, isOwn && styles.ownMessageText]}>
              {t("messages.messageDeleted")}
            </Text>
          ) : (
            <>
              {item.replyTo && (
                <View style={styles.replyPreview}>
                  <Text style={styles.replyPreviewSender} numberOfLines={1}>
                    {item.replyTo.sender?.displayName || item.replyTo.sender?.username}
                  </Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {item.replyTo.isDeleted
                      ? t("messages.messageDeleted")
                      : item.replyTo.content || `[${item.replyTo.messageType}]`}
                  </Text>
                </View>
              )}

              {item.messageType === "TEXT" && (
                <HighlightText
                  text={item.content}
                  query={highlightQuery}
                  active={isCurrentMatch}
                  style={[styles.messageText, isOwn && styles.ownMessageText]}
                />
              )}

              {(item.messageType === "IMAGE" || item.messageType === "DRAWING") &&
                item.mediaUrl && (
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={styles.mediaImage}
                    resizeMode="cover"
                  />
                )}

              {item.messageType === "VIDEO" && item.mediaUrl && (
                <VideoMessageBubble uri={item.mediaUrl} thumbnailUri={item.thumbnailUrl} />
              )}

              {item.messageType === "VOICE" && item.mediaUrl && (
                <VoiceMessageBubble uri={item.mediaUrl} duration={item.duration} isOwn={isOwn} />
              )}

              {item.messageType === "FILE" && item.mediaUrl && (
                <TouchableOpacity style={styles.fileBubble} onPress={() => handleOpenLink(item.mediaUrl)}>
                  <View style={[styles.fileIcon, isOwn && styles.ownFileIcon]}>
                    <Ionicons name="document-text-outline" size={25} color={isOwn ? "#fff" : colors.primary} />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, isOwn && styles.ownMessageText]} numberOfLines={2}>
                      {item.fileName || t("messages.file")}
                    </Text>
                    {item.fileSize != null && (
                      <Text style={[styles.fileSize, isOwn && styles.ownFileSize]}>
                        {formatFileSize(item.fileSize)}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="download-outline" size={21} color={isOwn ? "#fff" : colors.primary} />
                </TouchableOpacity>
              )}

              {item.linkPreview && (
                <TouchableOpacity
                  style={styles.linkPreview}
                  onPress={() => handleOpenLink(item.linkPreview.url)}
                >
                  {item.linkPreview.imageUrl && (
                    <Image
                      source={{ uri: item.linkPreview.imageUrl }}
                      style={styles.linkImage}
                    />
                  )}
                  <View style={styles.linkInfo}>
                    <Text style={styles.linkTitle} numberOfLines={2}>
                      {item.linkPreview.title}
                    </Text>
                    <Text style={styles.linkDescription} numberOfLines={2}>
                      {item.linkPreview.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {item.youtubeEmbed && (
                <TouchableOpacity
                  style={styles.youtubeEmbed}
                  onPress={() => handleOpenLink(item.youtubeEmbed.url)}
                >
                  {item.youtubeEmbed.thumbnail && (
                    <Image
                      source={{ uri: item.youtubeEmbed.thumbnail }}
                      style={styles.youtubeThumbnail}
                    />
                  )}
                  <Ionicons
                    name="play-circle"
                    size={40}
                    color="#fff"
                    style={styles.playIcon}
                  />
                  <Text style={styles.youtubeTitle} numberOfLines={2}>
                    {item.youtubeEmbed.title}
                  </Text>
                </TouchableOpacity>
              )}

              {!!item.reactions?.length && (
                <View style={styles.reactionsRow}>
                  {Object.entries(
                    item.reactions.reduce((acc, reaction) => {
                      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([emoji, count]) => (
                    <View key={emoji} style={styles.reactionChip}>
                      <Text style={styles.reactionChipText}>
                        {emoji} {count > 1 ? count : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
            {item.isEdited && !item.deletedAt ? `${t("messages.edited")} ` : ""}
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isOwn && item.deliveryState && (
            <View style={styles.deliveryStateRow}>
              <Ionicons
                name={item.deliveryState === "failed" ? "alert-circle" : "time-outline"}
                size={12}
                color="#FFFFFF"
              />
              <Text style={styles.deliveryStateText}>
                {t(`messages.delivery.${item.deliveryState}`)}
              </Text>
            </View>
          )}
          {isOwn && readStatus && (
            <Text style={styles.readStatusText}>{readStatus}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const typingIndicator =
    typingUsers.size > 0 ? (
      <View style={styles.typingContainer}>
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      {searchActive && (
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("messages.searchInConversation")}
              colors={colors}
              autoFocus
              style={styles.searchBarFlex}
            />
            {!!searchQuery.trim() && (
              <Text style={styles.searchCount}>
                {matches.length
                  ? t("messages.searchMatchCount", {
                      current: currentMatchIndex + 1,
                      total: matches.length,
                    })
                  : "0"}
              </Text>
            )}
            <TouchableOpacity
              style={styles.searchNavButton}
              onPress={() => goToMatch(currentMatchIndex - 1)}
              disabled={!matches.length}
              accessibilityRole="button"
              accessibilityLabel="Previous match"
            >
              <Ionicons
                name="chevron-up"
                size={20}
                color={matches.length ? colors.primary : colors.mutedText}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchNavButton}
              onPress={() => goToMatch(currentMatchIndex + 1)}
              disabled={!matches.length}
              accessibilityRole="button"
              accessibilityLabel="Next match"
            >
              <Ionicons
                name="chevron-down"
                size={20}
                color={matches.length ? colors.primary : colors.mutedText}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchNavButton}
              onPress={handleCloseSearch}
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
            >
              <Ionicons name="close" size={20} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
          {!!searchQuery.trim() && !matches.length && (
            <Text style={styles.noMatchesText}>{t("messages.noMatchesFound")}</Text>
          )}
          <FilterChips
            options={[
              { key: "all", label: t("messages.filterAll") },
              { key: "text", label: t("messages.filterText") },
              { key: "media", label: t("messages.filterMedia") },
            ]}
            selectedKey={searchFilter}
            onSelect={setSearchFilter}
            colors={colors}
          />
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.5,
            });
          }, 150);
        }}
        ListHeaderComponent={
          hasOlderMessages && messages.length > 0 ? (
            <TouchableOpacity
              style={styles.loadEarlierButton}
              onPress={() => loadOlderMessages(conversationId, token)}
              disabled={loadingOlderMessages}
              accessibilityRole="button"
            >
              {loadingOlderMessages ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadEarlierText}>{t("messages.loadEarlier")}</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-outline"
            title={t("messages.noMessages")}
          />
        }
      />

      {typingIndicator}

      {(replyTarget || editTarget) && (
        <View style={styles.contextBar}>
          <View style={styles.contextBarText}>
            <Text style={styles.contextBarTitle}>
              {editTarget ? t("messages.editMessage") : t("messages.replyingTo")}
            </Text>
            <Text style={styles.contextBarBody} numberOfLines={1}>
              {editTarget ? editTarget.content : replyTarget.content || `[${replyTarget.messageType}]`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setReplyTarget(null);
              if (editTarget) {
                setEditTarget(null);
                setMessageText("");
              }
            }}
          >
            <Ionicons name="close" size={20} color={colors.mutedText} />
          </TouchableOpacity>
        </View>
      )}

      {recordingVoice ? (
        <VoiceRecorderBar onCancel={handleVoiceCancel} onSend={handleVoiceSend} />
      ) : (
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setAttachmentSheetVisible(true)}
            disabled={uploadingMedia}
          >
            {uploadingMedia ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={t("messages.typeMessage")}
            placeholderTextColor={colors.mutedText}
            value={messageText}
            onChangeText={handleTyping}
            onKeyPress={(event) => {
              if (
                Platform.OS === "web" &&
                event.nativeEvent.key === "Enter" &&
                !event.nativeEvent.shiftKey
              ) {
                event.preventDefault?.();
                handleSendMessage();
              }
            }}
            multiline
            maxLength={10000}
            maxHeight={100}
            editable={!sending}
          />

          {messageText.trim() ? (
            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="send" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => setRecordingVoice(true)}
            >
              <Ionicons name="mic" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onSelect={handleAttachmentSelect}
      />

      <DrawingPad
        visible={drawingVisible}
        onClose={() => setDrawingVisible(false)}
        onSend={handleDrawingSend}
      />
    </KeyboardAvoidingView>
  );
};


const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerActions: {
    flexDirection: "row",
    marginRight: 4,
  },
  headerButton: {
    padding: 8,
    marginLeft: 4,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  searchBarFlex: {
    flex: 1,
  },
  searchCount: {
    fontSize: 13,
    color: colors.mutedText,
    minWidth: 36,
    textAlign: "center",
  },
  searchNavButton: {
    padding: 4,
  },
  noMatchesText: {
    fontSize: 12,
    color: colors.mutedText,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loadEarlierButton: {
    alignSelf: "center",
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  loadEarlierText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  systemMessageRow: {
    alignSelf: "center",
    alignItems: "center",
    maxWidth: "86%",
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.input,
  },
  systemMessageText: {
    color: colors.secondaryText,
    fontSize: 13,
    textAlign: "center",
  },
  systemMessageTime: {
    marginTop: 3,
    color: colors.mutedText,
    fontSize: 10,
  },
  ownMessageRow: {
    justifyContent: "flex-end",
  },
  otherMessageRow: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  messageBubble: {
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  ownBubble: {
    backgroundColor: colors.primary,
  },
  otherBubble: {
    backgroundColor: colors.input,
  },
  matchedBubble: {
    borderWidth: 1,
    borderColor: "#FFE066",
  },
  currentMatchBubble: {
    borderWidth: 2,
    borderColor: "#FF9F1C",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.secondaryText,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    color: colors.text,
  },
  ownMessageText: {
    color: "#fff",
  },
  messageTime: {
    fontSize: 11,
    color: colors.mutedText,
    marginTop: 4,
  },
  ownMessageTime: {
    color: "#fff",
    opacity: 0.8,
  },
  deliveryStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  deliveryStateText: {
    color: "#FFFFFF",
    fontSize: 11,
    opacity: 0.9,
  },
  readStatusText: {
    color: "#FFFFFF",
    fontSize: 11,
    marginTop: 3,
    opacity: 0.9,
  },
  deletedText: {
    fontStyle: "italic",
    color: colors.mutedText,
  },
  replyPreview: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 6,
    marginBottom: 4,
    opacity: 0.85,
  },
  replyPreviewSender: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  replyPreviewText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  reactionChip: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginTop: 2,
  },
  reactionChipText: {
    fontSize: 12,
  },
  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.input,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  contextBarText: {
    flex: 1,
    marginRight: 8,
  },
  contextBarTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  contextBarBody: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginVertical: 4,
  },
  fileBubble: {
    minWidth: 220,
    maxWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  ownFileIcon: { backgroundColor: "rgba(255,255,255,.18)" },
  fileInfo: { flex: 1 },
  fileName: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  fileSize: { color: colors.mutedText, marginTop: 3, fontSize: 11 },
  ownFileSize: { color: "rgba(255,255,255,.72)" },
  videoContainer: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  videoText: {
    color: "#fff",
    marginTop: 8,
    fontSize: 12,
  },
  linkPreview: {
    marginVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  linkImage: {
    width: "100%",
    height: 100,
  },
  linkInfo: {
    padding: 8,
  },
  linkTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  linkDescription: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  youtubeEmbed: {
    width: 200,
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 4,
  },
  youtubeThumbnail: {
    width: "100%",
    height: "100%",
  },
  playIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -20,
    marginTop: -20,
  },
  youtubeTitle: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: 11,
    padding: 6,
  },
  typingContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mutedText,
  },
  inputContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.input,
    maxHeight: 100,
  },
  sendButton: {
    padding: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
