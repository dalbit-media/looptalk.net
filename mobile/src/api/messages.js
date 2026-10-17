import { api } from "./client";
import { readOwnerVault, updateOwnerVault } from "../utils/ownerVault";
import { getOwnerGeneration, assertOwnerGeneration } from "../utils/ownerSession";
import { resolveContactDisplayName } from "../utils/contactDisplayName";

const privateConversation = (conversation) => {
  const vault = readOwnerVault();
  return {
    ...conversation,
    name: vault.conversationNames?.[conversation.id] || conversation.name,
    participants: conversation.participants?.map((participant) => {
      const contact = vault.contacts.find((item) => item.contactUserId === participant.userId);
      return contact ? {
        ...participant, user: { ...participant.user, displayName: resolveContactDisplayName(contact, participant.user) },
      } : participant;
    }),
  };
};

const appendUpload = async (formData, field, { uri, name, mimeType }) => {
  if (typeof uri !== "string" || !uri) {
    throw new Error(`Missing upload URI: ${name}`);
  }

  if (typeof window !== "undefined") {
    let blob;
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(uri)) {
      const binary = globalThis.atob(uri);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      blob = new Blob([bytes], { type: mimeType });
    } else {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to read upload: ${name} (${response.status})`);
      }
      blob = await response.blob();
    }
    if (!blob.type && mimeType) {
      blob = new Blob([blob], { type: mimeType });
    }
    formData.append(field, blob, name);
    return;
  }

  formData.append(field, { uri, name, type: mimeType || "application/octet-stream" });
};

export const getConversations = async (token) => {
  const generation = getOwnerGeneration();
  const response = await api.get("/conversations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertOwnerGeneration(generation);
  return response.data.map(privateConversation);
};

export const getConversation = async (conversationId, token) => {
  const generation = getOwnerGeneration();
  const response = await api.get(`/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertOwnerGeneration(generation);
  return privateConversation(response.data);
};

export const markConversationRead = async (conversationId, token) => {
  const response = await api.post(
    `/conversations/${conversationId}/read`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const getOrCreateDirectConversation = async (userId, token) => {
  const generation = getOwnerGeneration();
  const response = await api.post(
    `/conversations/direct/${userId}`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  assertOwnerGeneration(generation);
  return privateConversation(response.data);
};

export const createGroupConversation = async (name, userIds, token) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("Invalid private group name");
  const generation = getOwnerGeneration();
  const response = await api.post(
    "/conversations",
    { userIds },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  assertOwnerGeneration(generation);
  await updateOwnerVault((current) => ({
    ...current, conversationNames: { ...current.conversationNames, [response.data.id]: name },
  }));
  return privateConversation(response.data);
};

export const renameGroupConversation = async (conversationId, name, token) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("Invalid private group name");
  await updateOwnerVault((current) => ({
    ...current, conversationNames: { ...current.conversationNames, [conversationId]: name },
  }));
  return getConversation(conversationId, token);
};

export const addGroupMember = async (conversationId, userId, token) => {
  const response = await api.post(
    `/conversations/${conversationId}/members`,
    { userId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const updateGroupMemberRole = async (conversationId, userId, role, token) => {
  const response = await api.patch(
    `/conversations/${conversationId}/members/${userId}`,
    { role },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const removeGroupMember = async (conversationId, userId, token) => {
  const response = await api.delete(
    `/conversations/${conversationId}/members/${userId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const leaveGroupConversation = async (conversationId, token) => {
  const response = await api.post(
    `/conversations/${conversationId}/leave`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const getMessages = async (conversationId, token, { before, limit } = {}) => {
  const response = await api.get(`/messages/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { before, limit },
  });
  return response.data;
};

export const sendTextMessage = async (
  conversationId,
  content,
  token,
  replyToId,
  clientMessageId
) => {
  const response = await api.post(
    `/messages/${conversationId}/text`,
    {
      content,
      ...(replyToId ? { replyToId } : {}),
      ...(clientMessageId ? { clientMessageId } : {}),
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const sendMediaMessage = async (
  conversationId,
  {
    uri,
    name,
    mimeType,
    messageType,
    duration,
    width,
    height,
    fileName,
    fileSize,
    thumbnailUri,
    thumbnailName,
    thumbnailMimeType,
    replyToId,
  },
  token,
  { onUploadProgress } = {}
) => {
  const formData = new FormData();
  await appendUpload(formData, "file", { uri, name, mimeType });
  formData.append("messageType", messageType);
  if (duration != null) formData.append("duration", String(duration));
  if (width != null) formData.append("width", String(width));
  if (height != null) formData.append("height", String(height));
  if (fileName) formData.append("fileName", fileName);
  if (fileSize != null) formData.append("fileSize", String(fileSize));
  if (replyToId) formData.append("replyToId", replyToId);
  if (thumbnailUri) {
    await appendUpload(formData, "thumbnail", {
      uri: thumbnailUri,
      name: thumbnailName || "thumbnail.jpg",
      mimeType: thumbnailMimeType || "image/jpeg",
    });
  }

  const response = await api.post(
    `/messages/${conversationId}/media`,
    formData,
    {
      headers: { Authorization: `Bearer ${token}` },
      onUploadProgress,
      timeout: 120000,
    }
  );
  return response.data;
};

export const reactToMessage = async (
  conversationId,
  messageId,
  emoji,
  token
) => {
  const response = await api.post(
    `/messages/${conversationId}/${messageId}/react`,
    { emoji },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const editMessage = async (
  conversationId,
  messageId,
  content,
  token
) => {
  const response = await api.put(
    `/messages/${conversationId}/${messageId}`,
    { content },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const deleteMessage = async (conversationId, messageId, token) => {
  const response = await api.delete(
    `/messages/${conversationId}/${messageId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};
