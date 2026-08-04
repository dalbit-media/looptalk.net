import { api } from "./client";

const appendUpload = async (formData, field, { uri, name, mimeType }) => {
  formData.append(field, { uri, name, type: mimeType });
};

export const getConversations = async (token) => {
  const response = await api.get("/conversations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getConversation = async (conversationId, token) => {
  const response = await api.get(`/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
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
  const response = await api.post(
    `/conversations/direct/${userId}`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const createGroupConversation = async (name, userIds, token) => {
  const response = await api.post(
    "/conversations",
    { name, userIds },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const renameGroupConversation = async (conversationId, name, token) => {
  const response = await api.patch(
    `/conversations/${conversationId}`,
    { name },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
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
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
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
