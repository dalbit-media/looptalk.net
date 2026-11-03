// Short text describing a message for conversation lists and notifications; null when nothing describes it.
export const getMessagePreview = (message, t) => {
  if (!message) return null;
  if (message.deletedAt) return t("messages.messageDeleted");
  if (message.content) return message.content;
  if (message.messageType === "FILE") return message.fileName || t("messages.file");
  if (message.messageType === "IMAGE" || message.messageType === "DRAWING") return t("messages.imageCaption");
  if (message.messageType === "VIDEO") return t("messages.videoCaption");
  if (message.messageType === "VOICE") return t("messages.voiceCaption");
  return null;
};
