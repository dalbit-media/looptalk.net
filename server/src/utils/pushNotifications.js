const { Expo } = require("expo-server-sdk");
const prisma = require("../db/client");

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

const deactivateTokens = async (tokens) => {
  if (!tokens.length) return;
  await prisma.deviceToken.updateMany({
    where: { token: { in: tokens } },
    data: { isActive: false },
  });
};

const checkReceipts = (ticketTokens) => {
  const timer = setTimeout(async () => {
    try {
      const receiptIds = [...ticketTokens.keys()];
      const invalidTokens = [];
      for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        Object.entries(receipts).forEach(([receiptId, receipt]) => {
          if (receipt.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(ticketTokens.get(receiptId));
          } else if (receipt.status === "error") {
            console.error("Push receipt error:", receipt.message);
          }
        });
      }
      await deactivateTokens(invalidTokens.filter(Boolean));
    } catch (error) {
      console.error("Unable to check push receipts:", error);
    }
  }, RECEIPT_DELAY_MS);
  timer.unref?.();
};

const sendPushMessages = async (messages) => {
  const ticketTokens = new Map();
  const invalidTokens = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    tickets.forEach((ticket, index) => {
      const token = chunk[index].to;
      if (ticket.status === "ok") ticketTokens.set(ticket.id, token);
      else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(token);
      else console.error("Push ticket error:", ticket.message);
    });
  }
  await deactivateTokens(invalidTokens);
  if (ticketTokens.size) checkReceipts(ticketTokens);
};

const getActiveDevices = async (recipientIds) => {
  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: recipientIds }, isActive: true },
    select: { token: true },
  });
  return devices.filter(({ token }) => Expo.isExpoPushToken(token));
};

const sendIncomingCallPush = async ({ recipientIds, callId, conversationId, callType, caller }) => {
  const validDevices = await getActiveDevices(recipientIds);
  const messages = validDevices.map(({ token }) => ({
    to: token,
    title: caller.displayName || caller.username || "LoopTalk",
    body: callType === "video" ? "Incoming video call" : "Incoming voice call",
    sound: "default",
    priority: "high",
    ttl: 45,
    badge: 1,
    channelId: "incoming-calls",
    interruptionLevel: "time-sensitive",
    categoryId: "incoming-call",
    collapseId: callId,
    data: {
      type: "incoming_call",
      callId,
      conversationId,
      callType,
      caller,
    },
  }));

  await sendPushMessages(messages);
};

const sendMessagePush = async ({ recipientIds, conversationId, message }) => {
  if (!recipientIds.length) return;
  const validDevices = await getActiveDevices(recipientIds);
  const senderName = message.sender?.displayName || message.sender?.username || "LoopTalk";
  const mediaLabels = {
    IMAGE: "Sent a photo",
    VIDEO: "Sent a video",
    VOICE: "Sent a voice message",
    DRAWING: "Sent a drawing",
    FILE: message.fileName ? `Sent ${message.fileName}` : "Sent a file",
  };
  const body = message.messageType === "TEXT"
    ? message.content.slice(0, 180)
    : mediaLabels[message.messageType] || "Sent a message";
  const messages = validDevices.map(({ token }) => ({
    to: token,
    title: senderName,
    body,
    sound: "default",
    priority: "high",
    channelId: "messages",
    collapseId: conversationId,
    data: {
      type: "message",
      conversationId,
      messageId: message.id,
      senderName,
    },
  }));
  await sendPushMessages(messages);
};

module.exports = { sendIncomingCallPush, sendMessagePush };