import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
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
import { API_URL } from "../../config/environment";
import { showAlert } from "../../utils/showAlert";
import * as ReportAPI from "../../api/reports";

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ATTACHMENT_DISMISS_FALLBACK_MS = 500;

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
  const [quotedMessageId, setQuotedMessageId] = useState(null);
  const [jumpingToReply, setJumpingToReply] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState("all");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const [loadedConversationId, setLoadedConversationId] = useState(null);
  const [laidOutConversationId, setLaidOutConversationId] = useState(null);
  const [contentConversationId, setContentConversationId] = useState(null);
  const [positionedConversationId, setPositionedConversationId] = useState(null);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastKeyboardSubmitAtRef = useRef(0);
  const lastMessageIdRef = useRef(null);
  const contentScrollTimerRef = useRef(null);
  const initialScrollTimersRef = useRef([]);
  const drawingLaunchTimerRef = useRef(null);
  const quoteHighlightTimerRef = useRef(null);
  const quoteJumpActiveRef = useRef(false);
  const messagesRef = useRef(messages);
  const isWeb = Platform.OS === "web";
  messagesRef.current = messages;

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

  const jumpToQuotedMessage = async (targetMessageId) => {
    if (!targetMessageId || jumpingToReply) return;
    setJumpingToReply(true);
    try {
      quoteJumpActiveRef.current = true;
      clearTimeout(contentScrollTimerRef.current);
      initialScrollTimersRef.current.forEach(clearTimeout);
      initialScrollTimersRef.current = [];
      let state = useMessageStore.getState();
      let targetIndex = state.messages.findIndex((message) => message.id === targetMessageId);
      while (
        targetIndex < 0 &&
        state.currentConversation?.id === conversationId &&
        state.hasOlderMessages
      ) {
        const loadedOlderMessages = await loadOlderMessages(conversationId, token);
        state = useMessageStore.getState();
        targetIndex = state.messages.findIndex((message) => message.id === targetMessageId);
        if (!loadedOlderMessages) break;
      }

      if (targetIndex < 0) {
        showAlert(t("common.error"), t("messages.quotedMessageUnavailable"));
        return;
      }

      setQuotedMessageId(targetMessageId);
      isNearBottomRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => requestScrollToIndex(targetIndex)));
      if (quoteHighlightTimerRef.current) clearTimeout(quoteHighlightTimerRef.current);
      quoteHighlightTimerRef.current = setTimeout(() => {
        setQuotedMessageId(null);
        quoteHighlightTimerRef.current = null;
      }, 2500);
    } finally {
      setTimeout(() => {
        quoteJumpActiveRef.current = false;
      }, 1200);
      setJumpingToReply(false);
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

  const openUserProfile = (targetUserId) => {
    if (targetUserId) {
      navigation.navigate("Profile", { userId: targetUserId });
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => peerUser ? (
        <TouchableOpacity
          style={styles.headerProfileTitle}
          onPress={() => openUserProfile(peerUser.id)}
          accessibilityRole="button"
          accessibilityLabel={t("profile.viewProfile", { name: peerUser.displayName })}
        >
          <View style={styles.headerProfileAvatar}>
            {peerUser.profilePicture ? (
              <Image
                source={{ uri: `${API_URL}${peerUser.profilePicture}` }}
                style={styles.headerProfileAvatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.headerProfileAvatarText}>
                {(peerUser.displayName || peerUser.username || "?")[0]}
              </Text>
            )}
          </View>
          <Text style={styles.headerProfileName} numberOfLines={1}>
            {conversation?.name || route.params?.name || peerUser.displayName || t("messages.chat")}
          </Text>
        </TouchableOpacity>
      ) : conversation?.name || route.params?.name || t("messages.chat"),
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
  }, [navigation, canCall, canVideoCall, peerUser?.id, peerUser?.displayName, peerUser?.profilePicture, conversation?.name, conversation?.isGroupChat]);

  useEffect(() => {
    let isActive = true;
    setLoadedConversationId(null);
    setLaidOutConversationId(null);
    setContentConversationId(null);
    setPositionedConversationId(null);
    isNearBottomRef.current = true;
    loadMessages(conversationId, user.id, token).finally(() => {
      if (isActive) setLoadedConversationId(conversationId);
    });
    joinConversation(conversationId);

    return () => {
      isActive = false;
      stopTyping(conversationId, user.id);
      leaveConversation(conversationId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId, user.id, token, joinConversation, leaveConversation, loadMessages]);

  const scrollToBottom = (animated = true) => {
    if (!flatListRef.current || messagesRef.current.length === 0 || searchActive) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const list = flatListRef.current;
      list?.scrollToEnd({ animated });
      if (Platform.OS === "web") {
        list?.scrollToOffset({
          offset: Number.MAX_SAFE_INTEGER,
          animated,
        });
      }
    }));
  };

  useEffect(() => {
    lastMessageIdRef.current = null;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    setUnreadBelowCount(0);
    return () => {
      if (contentScrollTimerRef.current) {
        clearTimeout(contentScrollTimerRef.current);
      }
    };
  }, [conversationId]);

  useEffect(
    () => () => {
      if (drawingLaunchTimerRef.current) {
        clearTimeout(drawingLaunchTimerRef.current);
      }
      if (quoteHighlightTimerRef.current) {
        clearTimeout(quoteHighlightTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (
      loadedConversationId !== conversationId ||
      laidOutConversationId !== conversationId
    ) {
      return;
    }
    if (!messagesRef.current.length) {
      setPositionedConversationId(conversationId);
      return;
    }
    if (contentConversationId !== conversationId) return;
    initialScrollTimersRef.current.forEach(clearTimeout);
    initialScrollTimersRef.current = [];
    [0, 80, 180, 320].forEach((delay) => {
      const timer = setTimeout(() => {
        scrollToBottom(false);
      }, delay);
      initialScrollTimersRef.current.push(timer);
    });
    const positionedTimer = setTimeout(() => {
      isNearBottomRef.current = true;
      setPositionedConversationId(conversationId);
    }, 400);
    initialScrollTimersRef.current.push(positionedTimer);
    return () => {
      initialScrollTimersRef.current.forEach(clearTimeout);
      initialScrollTimersRef.current = [];
    };
  }, [
    conversationId,
    loadedConversationId,
    laidOutConversationId,
    contentConversationId,
  ]);

  useEffect(() => {
    if (messages.length === 0) {
      lastMessageIdRef.current = null;
      return;
    }
    if (searchActive) return;
    const latestMessage = messages[messages.length - 1];
    const previousLatestMessageId = lastMessageIdRef.current;
    lastMessageIdRef.current = latestMessage.id;
    if (
      previousLatestMessageId &&
      latestMessage.id !== previousLatestMessageId &&
      isNearBottomRef.current
    ) {
      scrollToBottom(true);
      return;
    }
    if (
      previousLatestMessageId &&
      latestMessage.id !== previousLatestMessageId &&
      latestMessage.senderId !== user.id &&
      !isNearBottomRef.current
    ) {
      setUnreadBelowCount((count) => count + 1);
    }
  }, [messages, searchActive, user.id]);

  useEffect(() => {
    if (searchActive) setShowScrollToLatest(false);
    if (!searchActive && isNearBottomRef.current) {
      scrollToBottom(false);
    }
    // Keep last message visible when composer height changes.
  }, [searchActive, recordingVoice, !!replyTarget, !!editTarget]);

  const handleStartCall = async (callType) => {
    if (!peerUser) return;
    try {
      const result = await startCall(conversationId, callType, peerUser);
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
        scrollToBottom(true);
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
      if (drawingLaunchTimerRef.current) {
        clearTimeout(drawingLaunchTimerRef.current);
      }
      drawingLaunchTimerRef.current = setTimeout(() => {
        drawingLaunchTimerRef.current = null;
        setDrawingVisible(true);
      }, ATTACHMENT_DISMISS_FALLBACK_MS);
    }
  };

  const handleAttachmentSheetDismiss = () => {
    if (!drawingLaunchTimerRef.current) return;
    clearTimeout(drawingLaunchTimerRef.current);
    drawingLaunchTimerRef.current = null;
    setDrawingVisible(true);
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
    if (
      !["queued", "failed"].includes(item.deliveryState) ||
      !item.clientMessageId
    ) {
      return;
    }
    try {
      await retryMessage(item.clientMessageId, token);
    } catch (error) {
      showAlert(t("common.error"), t("messages.sendFailed"));
    }
  };

  const handleInputKeyPress = (event) => {
    if (!isWeb) return;
    const key = event?.nativeEvent?.key;
    if (key !== "Enter" && key !== "NumpadEnter") return;
    event?.preventDefault?.();
    const now = Date.now();
    if (now - lastKeyboardSubmitAtRef.current < 150) return;
    lastKeyboardSubmitAtRef.current = now;
    handleSendMessage();
  };

  const handleInputSubmitEditing = () => {
    const now = Date.now();
    if (now - lastKeyboardSubmitAtRef.current < 150) return;
    lastKeyboardSubmitAtRef.current = now;
    handleSendMessage();
  };

  const renderMessageItem = ({ item, index }) => {
    if (item.messageType === "SYSTEM") {
      return (
        <View style={styles.systemMessageRow}>
          <Text style={styles.systemMessageText}>
            {item.content}
          </Text>
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
      item.sender?.displayName || item.sender?.username || t("messages.unknownUser");
    const senderAvatarUri = item.sender?.profilePicture
      ? `${API_URL}${item.sender.profilePicture}`
      : null;
    const previousMessage = messages[index - 1];
    const isSameSenderBurst =
      previousMessage &&
      previousMessage.messageType !== "SYSTEM" &&
      previousMessage.senderId === item.senderId &&
      new Date(item.createdAt) - new Date(previousMessage.createdAt) < 5 * 60 * 1000;
    const isFirstInSenderGroup =
      !isSameSenderBurst;
    const showSenderName = conversation?.isGroupChat && !isOwn && isFirstInSenderGroup;
    const showSenderAvatar = conversation?.isGroupChat && !isOwn && isFirstInSenderGroup;
    const isCurrentMatch =
      searchActive && matches.length > 0 && matches[currentMatchIndex]?.id === item.id;
    const isQuotedMessage = item.id === quotedMessageId;
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
          !isFirstInSenderGroup && styles.continuedMessageRow,
        ]}
      >
        {showSenderAvatar && (
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => openUserProfile(item.sender?.id || item.senderId)}
            accessibilityRole="button"
            accessibilityLabel={t("profile.viewProfile", { name: senderName })}
          >
            {senderAvatarUri ? (
              <Image source={{ uri: senderAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{senderName[0]}</Text>
            )}
          </TouchableOpacity>
        )}
        {conversation?.isGroupChat && !isOwn && !showSenderAvatar && (
          <View style={styles.avatarSpacer} />
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleRetryMessage(item)}
          onLongPress={() => handleMessageLongPress(item)}
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            conversation?.isGroupChat && !isOwn && styles.groupOtherBubble,
            !isFirstInSenderGroup && (isOwn ? styles.continuedOwnBubble : styles.continuedOtherBubble),
            isMatch && styles.matchedBubble,
            isCurrentMatch && styles.currentMatchBubble,
            isQuotedMessage && styles.quotedMessageBubble,
          ]}
        >
          {showSenderName && (
            <HighlightText
              text={senderName}
              query={highlightQuery}
              active={isCurrentMatch}
              style={styles.senderName}
            />
          )}

          {item.deletedAt ? (
            <Text
              style={[
                styles.messageText,
                styles.deletedText,
                isOwn && styles.ownMessageText,
              ]}
            >
              {t("messages.messageDeleted")}
            </Text>
          ) : (
            <>
              {item.replyTo && (
                <TouchableOpacity
                  style={[styles.replyPreview, isOwn && styles.ownReplyPreview]}
                  onPress={() => jumpToQuotedMessage(item.replyTo.id || item.replyToId)}
                  disabled={jumpingToReply || !(item.replyTo.id || item.replyToId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.replyTo.sender?.displayName || item.replyTo.sender?.username || ""}: ${item.replyTo.isDeleted
                    ? t("messages.messageDeleted")
                    : item.replyTo.content || `[${item.replyTo.messageType}]`}`}
                >
                  <Text
                    style={[styles.replyPreviewSender, isOwn && styles.ownReplyPreviewText]}
                    numberOfLines={1}
                  >
                    {item.replyTo.sender?.displayName || item.replyTo.sender?.username}
                  </Text>
                  <Text
                    style={[styles.replyPreviewText, isOwn && styles.ownReplyPreviewText]}
                    numberOfLines={2}
                  >
                    {item.replyTo.isDeleted
                      ? t("messages.messageDeleted")
                      : item.replyTo.content || `[${item.replyTo.messageType}]`}
                  </Text>
                </TouchableOpacity>
              )}

              {item.messageType === "TEXT" && (
                <HighlightText
                  text={item.content}
                  query={highlightQuery}
                  active={isCurrentMatch}
                  style={[
                    styles.messageText,
                    isOwn && styles.ownMessageText,
                  ]}
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
                    <Text
                      style={[
                        styles.fileName,
                        isOwn && styles.ownMessageText,
                      ]}
                      numberOfLines={2}
                    >
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

  const activeTypists = [...typingUsers]
    .filter((userId) => userId !== user.id)
    .map((userId) =>
      conversation?.participants?.find((participant) => participant.userId === userId)
        ?.user?.displayName || t("messages.someone")
    );
  const typingLabel = activeTypists.length === 1
    ? t("messages.userIsTyping", { name: activeTypists[0] })
    : activeTypists.length > 1
      ? t("messages.peopleAreTyping", { count: activeTypists.length })
      : "";
  const typingIndicator = typingLabel ? (
    <View style={styles.typingContainer} accessibilityLiveRegion="polite">
      <View style={styles.typingBubble}>
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
      </View>
      <Text style={styles.typingLabel}>{typingLabel}</Text>
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
        key={conversationId}
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.messageList}
        style={positionedConversationId === conversationId ? undefined : styles.initiallyHiddenList}
        keyboardShouldPersistTaps="always"
        onLayout={() => setLaidOutConversationId(conversationId)}
        onContentSizeChange={(_, contentHeight) => {
          if (messages.length > 0 && contentHeight > 0) {
            setContentConversationId(conversationId);
          }
          if (quoteJumpActiveRef.current) return;
          if (
            loadedConversationId === conversationId &&
            positionedConversationId !== conversationId &&
            messages.length > 0 &&
            contentHeight > 0
          ) {
            scrollToBottom(false);
            return;
          }
          if (
            messages.length === 0 ||
            positionedConversationId !== conversationId
          ) {
            return;
          }
          clearTimeout(contentScrollTimerRef.current);
          contentScrollTimerRef.current = setTimeout(() => {
            if (isNearBottomRef.current) {
              scrollToBottom(true);
            }
          }, 80);
        }}
        onScroll={(event) => {
          if (quoteJumpActiveRef.current) {
            isNearBottomRef.current = false;
            return;
          }
          if (positionedConversationId !== conversationId) {
            isNearBottomRef.current = true;
            return;
          }
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const isNearBottom = distanceFromBottom < 100;
          isNearBottomRef.current = isNearBottom;
          setShowScrollToLatest(!isNearBottom && messages.length > 0 && !searchActive);
          if (isNearBottom) setUnreadBelowCount(0);
        }}
        scrollEventThrottle={16}
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
        ListFooterComponent={<View style={styles.listBottomSpacer} />}
      />
      {positionedConversationId !== conversationId && (
        <View style={styles.initialLoadOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {typingIndicator}

      {showScrollToLatest && (
        <TouchableOpacity
          style={styles.scrollToLatestButton}
          onPress={() => {
            setUnreadBelowCount(0);
            isNearBottomRef.current = true;
            setShowScrollToLatest(false);
            scrollToBottom(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("messages.scrollToLatest")}
        >
          <Ionicons name="arrow-down" size={20} color={colors.primary} />
          {unreadBelowCount > 0 && (
            <View style={styles.scrollUnreadBadge}>
              <Text style={styles.scrollUnreadText}>
                {unreadBelowCount > 99 ? "99+" : unreadBelowCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

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
            onKeyPress={isWeb ? handleInputKeyPress : undefined}
            onSubmitEditing={handleInputSubmitEditing}
            multiline={!isWeb}
            maxLength={10000}
            maxHeight={isWeb ? undefined : 100}
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit={false}
            accessibilityLabel={t("messages.typeMessage")}
          />

          {messageText.trim() ? (
            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel={t("messages.sendMessage")}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, styles.voiceButton]}
              onPress={() => setRecordingVoice(true)}
              accessibilityRole="button"
              accessibilityLabel={t("messages.voiceMessage")}
            >
              <Ionicons name="mic" size={21} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onSelect={handleAttachmentSelect}
        onDismiss={handleAttachmentSheetDismiss}
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
  headerProfileTitle: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 190,
  },
  headerProfileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 8,
  },
  headerProfileAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  headerProfileAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerProfileName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  initiallyHiddenList: {
    opacity: 0,
  },
  initialLoadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
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
    paddingTop: 12,
    paddingBottom: 18,
  },
  listBottomSpacer: {
    height: 18,
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
  continuedMessageRow: {
    marginTop: 1,
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
    overflow: "hidden",
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarSpacer: {
    width: 36,
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  messageBubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  ownBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  otherBubble: {
    backgroundColor: colors.input,
    borderBottomLeftRadius: 6,
  },
  groupOtherBubble: {
    maxWidth: "72%",
  },
  continuedOwnBubble: {
    borderTopRightRadius: 8,
  },
  continuedOtherBubble: {
    borderTopLeftRadius: 8,
  },
  matchedBubble: {
    borderWidth: 1,
    borderColor: "#FFE066",
  },
  currentMatchBubble: {
    borderWidth: 2,
    borderColor: "#FF9F1C",
  },
  quotedMessageBubble: {
    borderWidth: 2,
    borderColor: "#FF9F1C",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.secondaryText,
    marginBottom: 5,
  },
  messageText: {
    fontSize: 18,
    color: colors.text,
    lineHeight: 28,
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
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 7,
  },
  ownReplyPreview: {
    borderLeftColor: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  replyPreviewSender: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  replyPreviewText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  ownReplyPreviewText: {
    color: "#FFFFFF",
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
    gap: 8,
    minHeight: 38,
  },
  typingBubble: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    backgroundColor: colors.input,
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mutedText,
  },
  typingLabel: {
    color: colors.mutedText,
    fontSize: 12,
  },
  scrollToLatestButton: {
    position: "absolute",
    right: 16,
    bottom: 76,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  scrollUnreadBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  scrollUnreadText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  inputContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
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
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.input,
    maxHeight: 100,
    lineHeight: 24,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  voiceButton: {
    backgroundColor: colors.primarySoft,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
