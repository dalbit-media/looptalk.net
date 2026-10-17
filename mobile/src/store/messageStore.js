import { create } from "zustand";
import { io } from "socket.io-client";
import * as api from "../api/messages";
import { API_URL } from "../config/environment";
import { useCallStore } from "./callStore";
import {
  readMessageOutbox,
  readConversationMessages,
  readConversationMessagesBatch,
  updateMessageOutbox,
  updateConversationMessages,
} from "../storage/conversationStorage";
import { useAuthStore } from "./authStore";
import { attachPresenceLifecycle, isPresenceActive } from "../utils/presenceLifecycle";
import {
  sendSecureDelivery, clearSecureDispatch, syncSecureInbox,
  materializePrivateMessage, preparePrivateAttachment, hydratePrivateMedia, clearSecureSession,
} from "../utils/secureMessaging";
import { showAlert } from "../utils/showAlert";
import { t } from "../i18n/i18n";
import { randomUUID } from "expo-crypto";
import { removePrivateMedia } from "../utils/privateMedia";

let outboxFlushPromise = null;
let detachPresenceLifecycle = null;
const sendsInFlight = new Map();
const OUTBOX_RETRY_INTERVAL_MS = 8000;

const generateClientMessageId = () => randomUUID();

const mergeMessage = (messages, message) => {
  const pendingId = message.clientMessageId
    ? `pending:${message.clientMessageId}`
    : null;
  const existingIndex = messages.findIndex(
    (item) =>
      item.id === message.id ||
      (pendingId && item.id === pendingId) ||
      (message.clientMessageId &&
        item.clientMessageId === message.clientMessageId &&
        (!item.senderId || !message.senderId || item.senderId === message.senderId))
  );
  if (existingIndex === -1) {
    return [...messages, message].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    );
  }

  const updated = [...messages];
  updated[existingIndex] = {
    ...updated[existingIndex],
    ...message,
    deliveryState: message.deliveryState || null,
  };
  const previous = messages[existingIndex];
  if (previous.encrypted && message.encrypted) {
    updated[existingIndex] = {
      ...updated[existingIndex],
      reactions: previous.reactions || [],
      ...(previous.editedAt ? {
        content: previous.content, editedAt: previous.editedAt, isEdited: previous.isEdited,
      } : {}),
      ...(previous.deletedAt ? {
        content: null, mediaUrl: null, thumbnailUrl: null, deletedAt: previous.deletedAt,
      } : {}),
    };
  }
  return updated;
};

const updateConversationPreview = (conversations, message) =>
  conversations
    .map((conversation) =>
      conversation.id === message.conversationId
        ? { ...conversation, messages: [message], lastMessageAt: message.createdAt }
        : conversation
    )
    .sort(
      (left, right) =>
        new Date(right.messages?.[0]?.createdAt || right.createdAt) -
        new Date(left.messages?.[0]?.createdAt || left.createdAt)
    );

const updatePreviewOperation = (conversations, operation, changes) =>
  conversations.map((conversation) => {
    const preview = conversation.messages?.[0];
    if (!preview || preview.id !== operation.messageId) return conversation;
    if (changes.requireSender && preview.senderId !== operation.actorId) return conversation;
    return { ...conversation, messages: [changes.update(preview)] };
  });

const editOperationSpec = (operation) => ({
  requireSender: true,
  update: (message) => message.deletedAt || (message.editedAt && message.editedAt >= operation.editedAt) ? message : ({
    ...message,
    content: operation.content,
    editedAt: operation.editedAt,
    isEdited: true,
  }),
});

const deleteOperationSpec = (operation) => ({
  requireSender: true,
  update: (message) => ({
    ...message,
    content: null,
    mediaUrl: null,
    thumbnailUrl: null,
    deletedAt: operation.deletedAt,
  }),
});

const reactOperationSpec = (operation) => ({
  update: (message) => {
    const withoutExisting = (message.reactions || []).filter(
      (reaction) =>
        reaction.userId !== operation.actorId || reaction.emoji !== operation.emoji
    );
    return {
      ...message,
      reactions:
        operation.action === "removed"
          ? withoutExisting
          : [
              ...withoutExisting,
              {
                userId: operation.actorId,
                emoji: operation.emoji,
                createdAt: operation.createdAt,
              },
            ],
    };
  },
});

export const useMessageStore = create((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  socket: null,
  activeUserId: null,
  loading: false,
  loadingOlderMessages: false,
  hasOlderMessages: true,
  legacyHistoryCursor: null,
  typingUsers: new Set(),
  onlineUsers: new Set(),
  presenceByUser: {},
  presenceConnected: false,
  outboxRetryTimerId: null,
  secureSyncError: null,

  _reportSecureError: (error) => {
    console.error("Encrypted message delivery failed:", error);
    const message = error.response?.data?.error || error.message;
    if (get().secureSyncError !== message) {
      set({ secureSyncError: message });
      showAlert(t("secure.deliveryErrorTitle"), t("secure.deliveryErrorBody"));
    }
  },

  _receiveSecureDelivery: async (delivery, body) => {
    const userId = get().activeUserId;
    if (!body || typeof body !== "object") throw new Error("Invalid encrypted message body");
    const operation = {
      ...body, messageId: delivery.messageId,
      conversationId: delivery.conversationId, actorId: delivery.senderId,
    };
    if (delivery.kind === "edit" && (typeof body.content !== "string" || !Number.isFinite(Date.parse(body.editedAt)))) {
      throw new Error("Invalid encrypted edit");
    }
    if (delivery.kind === "delete" && !Number.isFinite(Date.parse(body.deletedAt))) {
      throw new Error("Invalid encrypted deletion");
    }
    if (delivery.kind === "reaction" && (
      typeof body.emoji !== "string" || body.emoji.length > 32 ||
      !["added", "removed"].includes(body.action) || !Number.isFinite(Date.parse(body.createdAt))
    )) throw new Error("Invalid encrypted reaction");
    if (delivery.kind === "message") {
      const existing = (await readConversationMessages(userId, delivery.conversationId))
        .find((message) => message.id === delivery.messageId);
      if (get().activeUserId !== userId) throw new Error("The active account changed during delivery");
      if (existing?.encrypted && existing.deletedAt) return;
      const local = await materializePrivateMessage(userId, delivery.messageId, body);
      if (get().activeUserId !== userId) throw new Error("The active account changed during delivery");
      await get().receiveMessage({
        ...local, id: delivery.messageId, clientMessageId: delivery.messageId,
        conversationId: delivery.conversationId, senderId: delivery.senderId,
        sender: delivery.sender, createdAt: delivery.createdAt,
        encrypted: true, reactions: [], deliveryState: delivery.deliveryState,
      });
    } else if (delivery.kind === "edit") {
      await get().applyMessageOperation(operation, editOperationSpec(operation));
    } else if (delivery.kind === "delete") {
      const target = (await readConversationMessages(userId, delivery.conversationId))
        .find((message) => message.id === delivery.messageId);
      if (get().activeUserId !== userId) throw new Error("The active account changed during deletion");
      await get().applyMessageOperation(operation, deleteOperationSpec(operation));
      if (target?.senderId === delivery.senderId) {
        if (target.localMediaId) await removePrivateMedia(userId, target.localMediaId, target.mediaMimeType);
        if (target.localThumbnailId) await removePrivateMedia(userId, target.localThumbnailId, target.thumbnailMimeType);
      }
    } else if (delivery.kind === "reaction") {
      await get().applyMessageOperation(operation, reactOperationSpec(operation));
    } else {
      throw new Error("Unsupported encrypted message operation");
    }
  },

  _syncSecureMessages: async (token) => {
    const userId = get().activeUserId;
    if (!userId || !token) return;
    try {
      await syncSecureInbox(userId, token, get()._receiveSecureDelivery, () => get().activeUserId === userId);
      if (get().activeUserId === userId) set({ secureSyncError: null });
    } catch (error) {
      if (get().activeUserId === userId) get()._reportSecureError(error);
    }
  },

  upsertConversation: (conversation) => {
    if (!conversation?.id) return;
    set((state) => {
      const existing = state.conversations.find((item) => item.id === conversation.id);
      const updated = existing
        ? { ...existing, ...conversation, messages: existing.messages || [] }
        : { ...conversation, messages: conversation.messages || [], unreadCount: 0 };
      return {
        conversations: [
          updated,
          ...state.conversations.filter((item) => item.id !== conversation.id),
        ],
      };
    });
  },

  removeConversation: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.filter((item) => item.id !== conversationId),
      ...(state.currentConversation?.id === conversationId
        ? { currentConversation: null, messages: [], typingUsers: new Set() }
        : {}),
    }));
  },

  receiveMessage: async (message) => {
    const { activeUserId, currentConversation } = get();
    if (!activeUserId || !message?.conversationId || !message?.id) return;

    let isNewMessage = false;
    const storedMessages = await updateConversationMessages(
      activeUserId,
      message.conversationId,
      (messages) => {
        isNewMessage = !messages.some((item) => item.id === message.id);
        return mergeMessage(messages, message);
      }
    );

    const hydratedMessages = await hydratePrivateMedia(activeUserId, storedMessages);
    if (get().activeUserId !== activeUserId) throw new Error("The active account changed during storage");
    set((state) => ({
      messages:
        state.currentConversation?.id === message.conversationId
          ? hydratedMessages
          : state.messages,
      conversations: updateConversationPreview(state.conversations, hydratedMessages[hydratedMessages.length - 1] || message).map(
        (conversation) =>
          conversation.id === message.conversationId
            ? {
                ...conversation,
                unreadCount:
                  state.currentConversation?.id === message.conversationId ||
                  message.senderId === activeUserId ||
                  !isNewMessage
                    ? conversation.unreadCount || 0
                    : (conversation.unreadCount || 0) + 1,
              }
            : conversation
      ),
    }));

    if (
      currentConversation?.id === message.conversationId &&
      message.senderId !== activeUserId
    ) {
      get().markConversationRead(message.conversationId);
    }
  },

  applyMessageOperation: async (operation, changes) => {
    const { activeUserId, currentConversation } = get();
    if (!activeUserId || !operation?.conversationId) return;

    const storedMessages = await updateConversationMessages(
      activeUserId,
      operation.conversationId,
      (messages) =>
        messages.map((message) => {
          if (message.id !== operation.messageId) return message;
          if (changes.requireSender && message.senderId !== operation.actorId) {
            return message;
          }
          return changes.update(message);
        })
    );

    const hydratedMessages = await hydratePrivateMedia(activeUserId, storedMessages);
    if (get().activeUserId !== activeUserId) throw new Error("The active account changed during storage");
    set((state) => ({
      messages:
        state.currentConversation?.id === operation.conversationId
          ? hydratedMessages
          : state.messages,
      conversations: updatePreviewOperation(state.conversations, operation, changes),
    }));
  },

  initSocket: (token, userId) => {
    detachPresenceLifecycle?.();
    get().socket?.disconnect();
    get().stopOutboxRetry();
    const socket = io(API_URL, {
      auth: { token, presenceActive: isPresenceActive() },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    const presenceChanges = new Map();
    set({
      socket, activeUserId: userId, onlineUsers: new Set(),
      presenceByUser: {}, presenceConnected: false,
    });
    detachPresenceLifecycle = attachPresenceLifecycle(socket);
    get().startOutboxRetry(token);
    useCallStore.getState().attachSocket(socket);

    socket.on("connect", () => {
      presenceChanges.clear();
      set({ onlineUsers: new Set(), presenceConnected: false });
      useCallStore.getState()._handleSocketConnect();
      get().flushOutbox(token);
      get()._syncSecureMessages(token);
      const conversationId = get().currentConversation?.id;
      if (conversationId) {
        socket.emit("join_conversation", conversationId);
        get().markConversationRead(conversationId);
      }
    });
    socket.on("disconnect", () => {
      if (get().socket !== socket) return;
      set({ onlineUsers: new Set(), presenceConnected: false });
      useCallStore.getState()._handleSocketDisconnect();
    });
    socket.on("connect_error", (error) => {
      console.error("Message socket connection error:", error?.message || error);
    });
    socket.on("new_message", (message) => get().receiveMessage(message).catch(get()._reportSecureError));
    socket.on("secure_message_available", () => get()._syncSecureMessages(token));
    socket.on("message_edited", (operation) =>
      get().applyMessageOperation(operation, editOperationSpec(operation))
    );
    socket.on("message_deleted", (operation) =>
      get().applyMessageOperation(operation, deleteOperationSpec(operation))
    );
    socket.on("message_reacted", (operation) =>
      get().applyMessageOperation(operation, reactOperationSpec(operation))
    );
    socket.on("message_read", ({ conversationId, userId, lastReadAt }) => {
      if (!conversationId || !userId || !lastReadAt) return;
      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                participants: conversation.participants?.map((participant) =>
                  participant.userId === userId
                    ? { ...participant, lastReadAt }
                    : participant
                ),
              }
            : conversation
        ),
      }));
    });

    socket.on("user_typing", (data) => {
      const typingUsers = new Set(get().typingUsers);
      typingUsers.add(data.userId);
      set({ typingUsers });
    });

    socket.on("user_stop_typing", (data) => {
      const typingUsers = new Set(get().typingUsers);
      typingUsers.delete(data.userId);
      set({ typingUsers });
    });

    socket.on("user_status_changed", (data) => {
      if (get().socket !== socket) return;
      presenceChanges.set(data.userId, data);
      const onlineUsers = new Set(get().onlineUsers);
      if (data.status === "online") onlineUsers.add(data.userId);
      else onlineUsers.delete(data.userId);
      set((state) => ({
        onlineUsers,
        presenceByUser: { ...state.presenceByUser, [data.userId]: data },
      }));
    });

    socket.on("presence_snapshot", ({ users }) => {
      if (get().socket !== socket || !socket.connected) return;
      const presenceByUser = { ...get().presenceByUser };
      const onlineUsers = new Set();
      users.forEach((entry) => {
        presenceByUser[entry.userId] = entry;
        onlineUsers.add(entry.userId);
      });
      presenceChanges.forEach((entry) => {
        presenceByUser[entry.userId] = entry;
        if (entry.status === "online") onlineUsers.add(entry.userId);
        else onlineUsers.delete(entry.userId);
      });
      set({ presenceByUser, onlineUsers, presenceConnected: true });
    });

    socket.on("conversation_updated", (conversation) => {
      if (get().socket !== socket) return;
      const existing = get().conversations.find((item) => item.id === conversation.id);
      get().upsertConversation({ ...conversation, name: existing?.name || conversation.name });
    });
    socket.on("conversation_removed", ({ conversationId }) => {
      if (conversationId) get().removeConversation(conversationId);
    });

    return socket;
  },

  loadConversations: async (token, userId = get().activeUserId) => {
    set({ loading: true });
    try {
      const conversations = await api.getConversations(token);
      if (get().activeUserId !== userId) return;
      const cachedMessages = await readConversationMessagesBatch(
        userId,
        conversations.map((conversation) => conversation.id)
      );
      const hydrated = await Promise.all(conversations.map(async (conversation, index) => {
        const messages = await hydratePrivateMedia(userId, cachedMessages[index] || []);
        return {
          ...conversation,
          messages: messages.length
            ? [messages[messages.length - 1]]
            : conversation.messages || [],
          unreadCount: conversation.unreadCount || 0,
        };
      }));
      hydrated.sort(
        (left, right) =>
          new Date(right.messages?.[0]?.createdAt || right.createdAt) -
          new Date(left.messages?.[0]?.createdAt || left.createdAt)
      );
      if (get().activeUserId !== userId) return;
      set({ conversations: hydrated });
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      if (get().activeUserId === userId) set({ loading: false });
    }
  },

  loadMessages: async (conversationId, userId = get().activeUserId, token) => {
    const cachedMessages = await hydratePrivateMedia(
      userId, await readConversationMessages(userId, conversationId)
    );
    if (get().activeUserId !== userId) return;
    set((state) => ({
      messages: cachedMessages,
      currentConversation: { id: conversationId },
      hasOlderMessages: true,
      legacyHistoryCursor: null,
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      ),
    }));

    if (!token) return;
    try {
      await get()._syncSecureMessages(token);
      const [serverMessages] = await Promise.all([
        api.getMessages(conversationId, token),
        api.markConversationRead(conversationId, token),
      ]);
      if (get().activeUserId !== userId) return;
      const storedMessages = await updateConversationMessages(
        userId,
        conversationId,
        (current) => serverMessages.reduce(
          (messages, message) => mergeMessage(messages, message), current
        )
      );
      if (get().activeUserId === userId && get().currentConversation?.id === conversationId) {
        const hydratedMessages = await hydratePrivateMedia(userId, storedMessages);
        if (get().activeUserId !== userId || get().currentConversation?.id !== conversationId) return;
        set({
          messages: hydratedMessages,
          hasOlderMessages: serverMessages.length >= 50,
          legacyHistoryCursor: serverMessages[0]?.id || null,
        });
      }
    } catch (error) {
      // Offline or server unavailable: keep serving the local cache.
      console.log("Error syncing message history:", error);
    }
  },

  loadOlderMessages: async (conversationId, token) => {
    const { loadingOlderMessages, hasOlderMessages, legacyHistoryCursor, activeUserId } = get();
    if (loadingOlderMessages || !hasOlderMessages || !token || !legacyHistoryCursor) return false;

    set({ loadingOlderMessages: true });
    try {
      const olderMessages = await api.getMessages(conversationId, token, {
        before: legacyHistoryCursor,
        limit: 50,
      });
      const storedMessages = await updateConversationMessages(
        activeUserId,
        conversationId,
        (current) =>
          olderMessages.reduce(
            (merged, message) => mergeMessage(merged, message),
            current
          )
      );
      if (get().currentConversation?.id === conversationId) {
        set({
          messages: await hydratePrivateMedia(activeUserId, storedMessages),
          hasOlderMessages: olderMessages.length >= 50,
          legacyHistoryCursor: olderMessages[0]?.id || null,
        });
      }
      return olderMessages.length > 0;
    } catch (error) {
      console.error("Error loading older messages:", error);
      return false;
    } finally {
      set({ loadingOlderMessages: false });
    }
  },

  sendMessage: async (conversationId, content, token, replyToId) => {
    const activeUserId = get().activeUserId;
    const sender = useAuthStore.getState().user;
    if (!activeUserId || !sender) throw new Error("No active user");
    if (!token) throw new Error("Missing auth token");

    const clientMessageId = generateClientMessageId();
    const entry = {
      clientMessageId,
      conversationId,
      content,
      replyToId: replyToId || null,
      createdAt: new Date().toISOString(),
      status: "queued",
    };
    const replyTo = replyToId
      ? get().messages.find((message) => message.id === replyToId) || null
      : null;
    const optimisticMessage = {
      id: `pending:${clientMessageId}`,
      clientMessageId,
      conversationId,
      senderId: activeUserId,
      sender,
      content,
      messageType: "TEXT",
      replyToId: replyToId || null,
      replyTo,
      reactions: [],
      createdAt: entry.createdAt,
      deliveryState: "sending",
    };

    await updateMessageOutbox(activeUserId, (outbox) => [...outbox, entry]);
    await get().receiveMessage(optimisticMessage);
    get()._sendOutboxEntry(entry, token).catch((error) => {
      console.error("Initial message send failed:", error);
    });
    return optimisticMessage;
  },

  startOutboxRetry: (token) => {
    if (!token || get().outboxRetryTimerId) return;
    const timerId = setInterval(() => {
      const state = get();
      if (!state.activeUserId) return;
      state.flushOutbox(token);
      state._syncSecureMessages(token);
    }, OUTBOX_RETRY_INTERVAL_MS);
    set({ outboxRetryTimerId: timerId });
  },

  stopOutboxRetry: () => {
    const timerId = get().outboxRetryTimerId;
    if (timerId) clearInterval(timerId);
    set({ outboxRetryTimerId: null });
  },

  _setOutboxDeliveryState: async (entry, deliveryState, activeUserId = get().activeUserId) => {
    if (!activeUserId) return;
    const storedMessages = await updateConversationMessages(
      activeUserId,
      entry.conversationId,
      (messages) => messages.map((message) =>
        message.clientMessageId === entry.clientMessageId
          ? { ...message, deliveryState }
          : message
      )
    );
    const hydratedMessages = await hydratePrivateMedia(activeUserId, storedMessages);
    if (get().activeUserId !== activeUserId) return;
    set((state) => ({
      messages: state.currentConversation?.id === entry.conversationId
        ? hydratedMessages
        : state.messages,
      conversations: state.conversations.map((conversation) => {
        const preview = conversation.messages?.[0];
        return preview?.clientMessageId === entry.clientMessageId
          ? { ...conversation, messages: [{ ...preview, deliveryState }] }
          : conversation;
      }),
    }));
  },

  _sendOutboxEntry: (entry, token, options) => {
    const key = `${get().activeUserId}:${entry.clientMessageId}`;
    if (!sendsInFlight.has(key)) {
      sendsInFlight.set(key, get()._performOutboxEntry(entry, token, options).finally(() => sendsInFlight.delete(key)));
    }
    return sendsInFlight.get(key);
  },

  _performOutboxEntry: async (entry, token, options) => {
    const activeUserId = get().activeUserId;
    if (!activeUserId) throw new Error("No active user");
    await get()._setOutboxDeliveryState(entry, "sending", activeUserId);
    try {
      const conversation = get().conversations.find((item) => item.id === entry.conversationId)
        || await api.getConversation(entry.conversationId, token);
      if (conversation.kind !== "WELCOME") {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.clientMessageId)) {
          const legacyId = entry.clientMessageId;
          let normalized;
          await updateMessageOutbox(activeUserId, (outbox) => {
            const existing = outbox.find((item) =>
              item.clientMessageId === legacyId || item.legacyClientMessageId === legacyId);
            if (!existing) throw new Error("The pending message is no longer in the outbox");
            normalized = existing.legacyClientMessageId ? existing : {
              ...existing, legacyClientMessageId: legacyId, clientMessageId: generateClientMessageId(),
            };
            return outbox.map((item) => item === existing ? normalized : item);
          });
          entry = normalized;
        }
        if (entry.legacyClientMessageId) {
          await updateConversationMessages(activeUserId, entry.conversationId, (messages) =>
            messages.map((message) => message.clientMessageId === entry.legacyClientMessageId
              ? { ...message, id: `pending:${entry.clientMessageId}`, clientMessageId: entry.clientMessageId }
              : message)
          );
        }
      }
      let message;
      if (conversation.kind === "WELCOME") {
        message = await api.sendTextMessage(
          entry.conversationId, entry.content, token, entry.replyToId, entry.clientMessageId
        );
        if (get().activeUserId !== activeUserId) throw new Error("The active account changed during delivery");
        await get().receiveMessage(message);
      } else {
        const body = entry.secureBody || {
          content: entry.content, messageType: "TEXT", replyToId: entry.replyToId || null,
          replyTo: entry.replyToId
            ? get().messages.find((item) => item.id === entry.replyToId) || null : null,
        };
        const kind = entry.kind || "message";
        const messageId = entry.messageId || entry.clientMessageId;
        const delivery = {
          id: entry.clientMessageId, messageId, kind,
          conversationId: entry.conversationId, senderId: activeUserId,
          sender: useAuthStore.getState().user, createdAt: entry.createdAt,
          deliveryState: "sending",
        };
        await sendSecureDelivery({
          userId: activeUserId, token, conversationId: entry.conversationId,
          id: entry.clientMessageId, messageId, kind, body, options,
          persist: () => {
            if (get().activeUserId !== activeUserId) throw new Error("The active account changed during delivery");
            return get()._receiveSecureDelivery(delivery, body);
          },
        });
        message = { ...delivery, ...body, id: messageId, encrypted: true };
        await get()._setOutboxDeliveryState(entry, null, activeUserId);
      }
      await updateMessageOutbox(activeUserId, (outbox) =>
        outbox.filter((item) => item.clientMessageId !== entry.clientMessageId)
      );
      await clearSecureDispatch(activeUserId, entry.clientMessageId);
      return message;
    } catch (error) {
      const status = error.response?.status;
      const retryable = (!status && error.isAxiosError) || status === 429 || status >= 500;
      const deliveryState = retryable ? "queued" : "failed";
      console.error("Unable to send outbox entry:", {
        conversationId: entry.conversationId,
        clientMessageId: entry.clientMessageId,
        status: status || null,
        retryable,
      });
      await updateMessageOutbox(activeUserId, (outbox) => outbox.map((item) =>
        item.clientMessageId === entry.clientMessageId
          ? { ...item, status: deliveryState }
          : item
      ));
      await get()._setOutboxDeliveryState(entry, deliveryState, activeUserId);
      if (!retryable) {
        if (get().activeUserId === activeUserId) get()._reportSecureError(error);
        throw error;
      }
      return { ...entry, deliveryState };
    }
  },

  flushOutbox: async (token) => {
    if (outboxFlushPromise) return outboxFlushPromise;
    const activeUserId = get().activeUserId;
    if (!activeUserId || !token) return undefined;
    outboxFlushPromise = (async () => {
      await updateMessageOutbox(activeUserId, (outbox) => {
        const knownIds = new Set(outbox.flatMap((item) => [item.clientMessageId, item.legacyClientMessageId]));
        const recovered = get().messages
          .filter(
            (message) =>
              message.id?.startsWith("pending:") &&
              !!message.clientMessageId &&
              typeof message.content === "string" &&
              !!message.conversationId &&
              !knownIds.has(message.clientMessageId)
          )
          .map((message) => ({
            clientMessageId: message.clientMessageId,
            conversationId: message.conversationId,
            content: message.content,
            replyToId: message.replyToId || null,
            createdAt: message.createdAt || new Date().toISOString(),
            status: "queued",
          }));
        if (!recovered.length) return outbox;
        return [...outbox, ...recovered];
      });

      const entries = await readMessageOutbox(activeUserId);
      for (const entry of entries) {
        if (get().activeUserId !== activeUserId) break;
        if (entry.status === "failed") continue;
        try {
          await get()._sendOutboxEntry(entry, token);
        } catch (error) {
          console.error("Unable to retry queued message:", error);
        }
      }
    })().finally(() => {
      outboxFlushPromise = null;
    });
    return outboxFlushPromise;
  },

  retryMessage: async (clientMessageId, token) => {
    const activeUserId = get().activeUserId;
    if (!activeUserId || !token) return null;
    const entries = await readMessageOutbox(activeUserId);
    let entry = entries.find((item) => item.clientMessageId === clientMessageId);

    if (!entry) {
      const pendingMessage = get().messages.find(
        (message) =>
          message.clientMessageId === clientMessageId &&
          typeof message.content === "string" &&
          !!message.conversationId
      );
      if (!pendingMessage) return null;

      entry = {
        clientMessageId,
        conversationId: pendingMessage.conversationId,
        content: pendingMessage.content,
        replyToId: pendingMessage.replyToId || null,
        createdAt: pendingMessage.createdAt || new Date().toISOString(),
        status: "queued",
      };

      await updateMessageOutbox(activeUserId, (outbox) => {
        if (outbox.some((item) => item.clientMessageId === clientMessageId)) {
          return outbox;
        }
        return [...outbox, entry];
      });
    }

    return get()._sendOutboxEntry(entry, token, options);
  },

  sendMediaMessage: async (conversationId, mediaPayload, token, options) => {
    try {
      const conversation = get().conversations.find((item) => item.id === conversationId)
        || await api.getConversation(conversationId, token);
      if (conversation.kind !== "WELCOME") {
        const userId = get().activeUserId;
        if (!userId) throw new Error("No active user");
        const entry = {
          clientMessageId: generateClientMessageId(), conversationId,
          secureBody: await preparePrivateAttachment(mediaPayload),
          createdAt: new Date().toISOString(), status: "queued",
        };
        await updateMessageOutbox(userId, (outbox) => [...outbox, entry]);
        await get()._receiveSecureDelivery({
          id: entry.clientMessageId, messageId: entry.clientMessageId, kind: "message",
          conversationId, senderId: userId, sender: useAuthStore.getState().user,
          createdAt: entry.createdAt, deliveryState: "queued",
        }, entry.secureBody);
        return get()._sendOutboxEntry(entry, token);
      }
      const message = await api.sendMediaMessage(
        conversationId,
        mediaPayload,
        token,
        options
      );
      await get().receiveMessage(message);
      return message;
    } catch (error) {
      console.error("Error sending media message:", error);
      throw error;
    }
  },

  reactToMessage: async (conversationId, messageId, emoji, token) => {
    const target = get().messages.find((message) => message.id === messageId);
    if (target?.encrypted) {
      const existing = target.reactions?.some((reaction) =>
        reaction.userId === get().activeUserId && reaction.emoji === emoji);
      return get()._sendSecureOperation(conversationId, messageId, "reaction", {
        emoji, action: existing ? "removed" : "added", createdAt: new Date().toISOString(),
      }, token);
    }
    const operation = await api.reactToMessage(conversationId, messageId, emoji, token);
    await get().applyMessageOperation(operation, reactOperationSpec(operation));
    return operation;
  },

  editMessage: async (conversationId, messageId, content, token) => {
    if (get().messages.find((message) => message.id === messageId)?.encrypted) {
      return get()._sendSecureOperation(conversationId, messageId, "edit", {
        content, editedAt: new Date().toISOString(),
      }, token);
    }
    const operation = await api.editMessage(conversationId, messageId, content, token);
    await get().applyMessageOperation(operation, editOperationSpec(operation));
    return operation;
  },

  deleteMessage: async (conversationId, messageId, token) => {
    if (get().messages.find((message) => message.id === messageId)?.encrypted) {
      return get()._sendSecureOperation(conversationId, messageId, "delete", {
        deletedAt: new Date().toISOString(),
      }, token);
    }
    await api.deleteMessage(conversationId, messageId, token);
    await get().applyMessageOperation(
      { conversationId, messageId, actorId: get().activeUserId },
      deleteOperationSpec({ deletedAt: new Date().toISOString() })
    );
  },

  _sendSecureOperation: async (conversationId, messageId, kind, secureBody, token) => {
    const entry = {
      clientMessageId: generateClientMessageId(), messageId, conversationId,
      kind, secureBody, createdAt: new Date().toISOString(), status: "queued",
    };
    await updateMessageOutbox(get().activeUserId, (outbox) => [...outbox, entry]);
    return get()._sendOutboxEntry(entry, token);
  },

  joinConversation: (conversationId) => {
    get().socket?.emit("join_conversation", conversationId);
    get().markConversationRead(conversationId);
  },

  leaveConversation: (conversationId) => {
    get().socket?.emit("leave_conversation", conversationId);
    if (get().currentConversation?.id === conversationId) {
      set({ currentConversation: null, messages: [], typingUsers: new Set() });
    }
  },

  markConversationRead: (conversationId) => {
    if (!conversationId) return;
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      ),
    }));
    if (get().socket?.connected) {
      get().socket.emit("message_read", { conversationId });
    }
  },

  setTyping: (conversationId, userId, userName) => {
    get().socket?.emit("typing", {
      conversationId, userId, userName: useAuthStore.getState().user?.username || userId,
    });
  },

  stopTyping: (conversationId, userId) => {
    get().socket?.emit("stop_typing", { conversationId, userId });
  },

  cleanup: () => {
    clearSecureSession(get().activeUserId);
    detachPresenceLifecycle?.();
    detachPresenceLifecycle = null;
    get().socket?.disconnect();
    get().stopOutboxRetry();
    useCallStore.getState().detachSocket();
    set({
      conversations: [],
      currentConversation: null,
      messages: [],
      socket: null,
      activeUserId: null,
      outboxRetryTimerId: null,
      loadingOlderMessages: false,
      hasOlderMessages: true,
      legacyHistoryCursor: null,
      typingUsers: new Set(),
      onlineUsers: new Set(),
      presenceByUser: {},
      presenceConnected: false,
      secureSyncError: null,
    });
  },
}));
