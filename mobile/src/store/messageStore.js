import { create } from "zustand";
import { io } from "socket.io-client";
import * as api from "../api/messages";
import { API_URL } from "../config/environment";
import { useCallStore } from "./callStore";
import {
  readMessageOutbox,
  readConversationMessages,
  updateMessageOutbox,
  updateConversationMessages,
} from "../storage/conversationStorage";
import { useAuthStore } from "./authStore";

let outboxFlushPromise = null;

const generateClientMessageId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random()
    .toString(36)
    .slice(2)}`;
};

const mergeMessage = (messages, message) => {
  const existingIndex = messages.findIndex(
    (item) =>
      item.id === message.id ||
      (message.clientMessageId &&
        item.clientMessageId === message.clientMessageId &&
        item.senderId === message.senderId)
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
    deliveryState: message.id?.startsWith("pending:")
      ? message.deliveryState
      : null,
  };
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
  update: (message) => ({
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
  typingUsers: new Set(),
  onlineUsers: new Set(),

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

    set((state) => ({
      messages:
        state.currentConversation?.id === message.conversationId
          ? storedMessages
          : state.messages,
      conversations: updateConversationPreview(state.conversations, message).map(
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

    set((state) => ({
      messages:
        state.currentConversation?.id === operation.conversationId
          ? storedMessages
          : state.messages,
      conversations: updatePreviewOperation(state.conversations, operation, changes),
    }));
  },

  initSocket: (token, userId) => {
    get().socket?.disconnect();
    const socket = io(API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    set({ socket, activeUserId: userId });
    useCallStore.getState().attachSocket(socket);

    socket.on("connect", () => {
      useCallStore.getState()._handleSocketConnect();
      get().flushOutbox(token);
      const conversationId = get().currentConversation?.id;
      if (conversationId) {
        socket.emit("join_conversation", conversationId);
        get().markConversationRead(conversationId);
      }
    });
    socket.on("disconnect", () => useCallStore.getState()._handleSocketDisconnect());
    socket.on("new_message", (message) => get().receiveMessage(message));
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
      const onlineUsers = new Set(get().onlineUsers);
      if (data.status === "online") onlineUsers.add(data.userId);
      else onlineUsers.delete(data.userId);
      set({ onlineUsers });
    });

    socket.on("conversation_updated", (conversation) => {
      get().upsertConversation(conversation);
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
      const hydrated = await Promise.all(
        conversations.map(async (conversation) => {
          const messages = await readConversationMessages(userId, conversation.id);
          return {
            ...conversation,
            messages: messages.length
              ? [messages[messages.length - 1]]
              : conversation.messages || [],
            unreadCount: conversation.unreadCount || 0,
          };
        })
      );
      hydrated.sort(
        (left, right) =>
          new Date(right.messages?.[0]?.createdAt || right.createdAt) -
          new Date(left.messages?.[0]?.createdAt || left.createdAt)
      );
      set({ conversations: hydrated });
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      set({ loading: false });
    }
  },

  loadMessages: async (conversationId, userId = get().activeUserId, token) => {
    const cachedMessages = await readConversationMessages(userId, conversationId);
    set((state) => ({
      messages: cachedMessages,
      currentConversation: { id: conversationId },
      hasOlderMessages: true,
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      ),
    }));

    if (!token) return;
    try {
      const [serverMessages] = await Promise.all([
        api.getMessages(conversationId, token),
        api.markConversationRead(conversationId, token),
      ]);
      const merged = serverMessages.reduce(
        (messages, message) => mergeMessage(messages, message),
        cachedMessages
      );
      const storedMessages = await updateConversationMessages(
        userId,
        conversationId,
        () => merged
      );
      if (get().currentConversation?.id === conversationId) {
        set({
          messages: storedMessages,
          hasOlderMessages: serverMessages.length >= 50,
        });
      }
    } catch (error) {
      // Offline or server unavailable: keep serving the local cache.
      console.log("Error syncing message history:", error);
    }
  },

  loadOlderMessages: async (conversationId, token) => {
    const { loadingOlderMessages, hasOlderMessages, messages, activeUserId } = get();
    if (loadingOlderMessages || !hasOlderMessages || !token || !messages.length) return;

    set({ loadingOlderMessages: true });
    try {
      const olderMessages = await api.getMessages(conversationId, token, {
        before: messages[0].id,
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
          messages: storedMessages,
          hasOlderMessages: olderMessages.length >= 50,
        });
      }
    } catch (error) {
      console.error("Error loading older messages:", error);
    } finally {
      set({ loadingOlderMessages: false });
    }
  },

  sendMessage: async (conversationId, content, token, replyToId) => {
    const activeUserId = get().activeUserId;
    const sender = useAuthStore.getState().user;
    if (!activeUserId || !sender) throw new Error("No active user");

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
      deliveryState: get().socket?.connected ? "sending" : "queued",
    };

    await updateMessageOutbox(activeUserId, (outbox) => [...outbox, entry]);
    await get().receiveMessage(optimisticMessage);
    if (!get().socket?.connected) return optimisticMessage;
    return get()._sendOutboxEntry(entry, token);
  },

  _setOutboxDeliveryState: async (entry, deliveryState) => {
    const { activeUserId } = get();
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
    set((state) => ({
      messages: state.currentConversation?.id === entry.conversationId
        ? storedMessages
        : state.messages,
      conversations: state.conversations.map((conversation) => {
        const preview = conversation.messages?.[0];
        return preview?.clientMessageId === entry.clientMessageId
          ? { ...conversation, messages: [{ ...preview, deliveryState }] }
          : conversation;
      }),
    }));
  },

  _sendOutboxEntry: async (entry, token) => {
    const activeUserId = get().activeUserId;
    if (!activeUserId) throw new Error("No active user");
    await get()._setOutboxDeliveryState(entry, "sending");
    try {
      const message = await api.sendTextMessage(
        entry.conversationId,
        entry.content,
        token,
        entry.replyToId,
        entry.clientMessageId
      );
      await get().receiveMessage(message);
      await updateMessageOutbox(activeUserId, (outbox) =>
        outbox.filter((item) => item.clientMessageId !== entry.clientMessageId)
      );
      return message;
    } catch (error) {
      const status = error.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      const deliveryState = retryable ? "queued" : "failed";
      await updateMessageOutbox(activeUserId, (outbox) => outbox.map((item) =>
        item.clientMessageId === entry.clientMessageId
          ? { ...item, status: deliveryState }
          : item
      ));
      await get()._setOutboxDeliveryState(entry, deliveryState);
      if (!retryable) throw error;
      return { ...entry, deliveryState };
    }
  },

  flushOutbox: async (token) => {
    if (outboxFlushPromise) return outboxFlushPromise;
    const activeUserId = get().activeUserId;
    if (!activeUserId || !token || !get().socket?.connected) return undefined;
    outboxFlushPromise = (async () => {
      const entries = await readMessageOutbox(activeUserId);
      for (const entry of entries) {
        if (!get().socket?.connected || get().activeUserId !== activeUserId) break;
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
    const entries = await readMessageOutbox(activeUserId);
    const entry = entries.find((item) => item.clientMessageId === clientMessageId);
    if (!entry) return null;
    return get()._sendOutboxEntry(entry, token);
  },

  sendMediaMessage: async (conversationId, mediaPayload, token, options) => {
    try {
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
    const operation = await api.reactToMessage(conversationId, messageId, emoji, token);
    await get().applyMessageOperation(operation, reactOperationSpec(operation));
    return operation;
  },

  editMessage: async (conversationId, messageId, content, token) => {
    const operation = await api.editMessage(conversationId, messageId, content, token);
    await get().applyMessageOperation(operation, editOperationSpec(operation));
    return operation;
  },

  deleteMessage: async (conversationId, messageId, token) => {
    await api.deleteMessage(conversationId, messageId, token);
    await get().applyMessageOperation(
      { conversationId, messageId, actorId: get().activeUserId },
      deleteOperationSpec({ deletedAt: new Date().toISOString() })
    );
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
    get().socket?.emit("typing", { conversationId, userId, userName });
  },

  stopTyping: (conversationId, userId) => {
    get().socket?.emit("stop_typing", { conversationId, userId });
  },

  cleanup: () => {
    get().socket?.disconnect();
    useCallStore.getState().detachSocket();
    set({
      conversations: [],
      currentConversation: null,
      messages: [],
      socket: null,
      activeUserId: null,
      loadingOlderMessages: false,
      hasOlderMessages: true,
      typingUsers: new Set(),
      onlineUsers: new Set(),
    });
  },
}));
