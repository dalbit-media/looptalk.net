const { Expo } = require("expo-server-sdk");
const webPush = require("web-push");
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
    select: { token: true, platform: true },
  });
  return devices.filter(({ token, platform }) => platform === "web" || Expo.isExpoPushToken(token));
};

const webPushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let webPushReady = false;
const configureWebPush = () => {
  if (!webPushConfigured()) return false;
  if (!webPushReady) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@looptalk.net",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    webPushReady = true;
  }
  return true;
};

const parseSubscription = (token) => {
  try {
    const subscription = JSON.parse(token);
    return subscription?.endpoint && subscription.keys?.p256dh && subscription.keys?.auth ? subscription : null;
  } catch {
    return null;
  }
};

const sendWebPushes = async (devices, payload, { ttl = 60 * 60, urgency = "high" } = {}) => {
  if (!configureWebPush()) return;
  const body = JSON.stringify(payload);
  const expired = [];
  await Promise.all(devices.filter(({ platform }) => platform === "web").map(async ({ token }) => {
    const subscription = parseSubscription(token);
    if (!subscription) {
      expired.push(token);
      return;
    }
    try {
      await webPush.sendNotification(subscription, body, { TTL: ttl, urgency });
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) expired.push(token);
      else console.error("Web push error:", error.statusCode || error.message);
    }
  }));
  await deactivateTokens(expired);
};

const dispatch = async (devices, { expo, web, webOptions }) => {
  const nativeDevices = devices.filter(({ platform }) => platform !== "web");
  await Promise.all([
    nativeDevices.length ? sendPushMessages(nativeDevices.map(({ token }) => expo(token))) : null,
    sendWebPushes(devices, web, webOptions),
  ]);
};

const sendIncomingCallPush = async ({ recipientIds, callId, conversationId, callType, caller }) => {
  const validDevices = await getActiveDevices(recipientIds);
  const title = caller.displayName || caller.username || "LoopTalk";
  const body = callType === "video" ? "Incoming video call" : "Incoming voice call";
  const data = { type: "incoming_call", callId, conversationId, callType, caller };
  await dispatch(validDevices, {
    expo: (token) => ({
      to: token,
      title,
      body,
      sound: "default",
      priority: "high",
      ttl: 45,
      badge: 1,
      channelId: "incoming-calls",
      interruptionLevel: "time-sensitive",
      categoryId: "incoming-call",
      collapseId: callId,
      data,
    }),
    web: { title, body, tag: `call-${callId}`, requireInteraction: true, data },
    webOptions: { ttl: 45 },
  });
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
  const data = { type: "message", conversationId, messageId: message.id, senderName };
  await dispatch(validDevices, {
    expo: (token) => ({
      to: token,
      title: senderName,
      body,
      sound: "default",
      priority: "high",
      channelId: "messages",
      collapseId: conversationId,
      data,
    }),
    web: { title: senderName, body, tag: `conversation-${conversationId}`, data },
  });
};

const sendSecureMessagePush = async ({ recipientIds, conversationId, id }) => {
  if (!recipientIds.length) return;
  const validDevices = await getActiveDevices(recipientIds);
  const data = { type: "secure_message_available", conversationId, id };
  await dispatch(validDevices, {
    expo: (token) => ({
      to: token,
      title: "LoopTalk",
      body: "Encrypted message",
      sound: "default",
      priority: "high",
      channelId: "messages",
      collapseId: conversationId,
      data,
    }),
    web: { title: "LoopTalk", body: "Encrypted message", tag: `conversation-${conversationId}`, data },
  });
};

module.exports = {
  sendIncomingCallPush, sendMessagePush, sendSecureMessagePush, webPushConfigured, parseSubscription,
};