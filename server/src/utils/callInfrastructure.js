const PENDING_CALL_TTL_SECONDS = 50;
const localPendingCalls = new Map();
let redisClient = null;

const pendingCallKey = (userId, callId) => `looptalk:pending-call:${userId}:${callId}`;

const initializeCallInfrastructure = async (io) => {
  if (!process.env.REDIS_URL) return;
  const { createAdapter } = require("@socket.io/redis-streams-adapter");
  const { createClient } = require("redis");
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => console.error("Redis error:", error));
  await redisClient.connect();
  io.adapter(createAdapter(redisClient));
  console.log("Socket.IO Redis Streams adapter connected");
};

const savePendingCalls = async (recipientIds, call) => {
  const maximumExpiry = Date.now() + PENDING_CALL_TTL_SECONDS * 1000;
  const expiresAt = Math.min(call.expiresAt ?? maximumExpiry, maximumExpiry);
  const pendingCall = { ...call, expiresAt };
  if (redisClient) {
    await Promise.all(
      recipientIds.map((userId) =>
        redisClient.set(pendingCallKey(userId, call.callId), JSON.stringify(pendingCall), {
          EX: PENDING_CALL_TTL_SECONDS,
        })
      )
    );
    return;
  }
  recipientIds.forEach((userId) => {
    const calls = localPendingCalls.get(userId) || new Map();
    calls.set(call.callId, pendingCall);
    localPendingCalls.set(userId, calls);
  });
};

const getPendingCalls = async (userId) => {
  if (redisClient) {
    const calls = [];
    for await (const keys of redisClient.scanIterator({
      MATCH: pendingCallKey(userId, "*"),
      COUNT: 20,
    })) {
      if (!keys.length) continue;
      const values = await redisClient.mGet(keys);
      for (const value of values) {
        if (value) {
          const call = JSON.parse(value);
          if (call.expiresAt > Date.now()) calls.push(call);
        }
      }
    }
    return calls;
  }
  const now = Date.now();
  const calls = localPendingCalls.get(userId) || new Map();
  const active = [...calls.values()].filter((call) => call.expiresAt > now);
  if (active.length) {
    localPendingCalls.set(
      userId,
      new Map(active.map((call) => [call.callId, call]))
    );
  } else {
    localPendingCalls.delete(userId);
  }
  return active;
};

const clearPendingCall = async (recipientIds, callId) => {
  if (redisClient) {
    await redisClient.del(recipientIds.map((userId) => pendingCallKey(userId, callId)));
    return;
  }
  recipientIds.forEach((userId) => {
    const calls = localPendingCalls.get(userId);
    calls?.delete(callId);
    if (calls?.size === 0) localPendingCalls.delete(userId);
  });
};

const resumeActiveCall = ({
  activeCallsBySocket, callDisconnectTimers, socketId, userId,
  callId, conversationId, otherIds,
}) => {
  const current = activeCallsBySocket.get(socketId) || new Map();
  let owned = false;
  for (const [previousId, calls] of activeCallsBySocket) {
    const call = calls.get(callId);
    if (call?.conversationId !== conversationId || call.ownerId !== userId) continue;
    owned = true;
    if (previousId === socketId) continue;
    calls.delete(callId);
    if (calls.size === 0) {
      activeCallsBySocket.delete(previousId);
      const timer = callDisconnectTimers.get(previousId);
      if (timer) clearTimeout(timer);
      callDisconnectTimers.delete(previousId);
    }
  }
  if (owned) {
    current.set(callId, { ownerId: userId, conversationId, otherIds });
    activeCallsBySocket.set(socketId, current);
  }
  return owned;
};

const closeCallInfrastructure = async () => {
  if (redisClient?.isOpen) await redisClient.close();
  redisClient = null;
};

module.exports = {
  clearPendingCall,
  closeCallInfrastructure,
  getPendingCalls,
  initializeCallInfrastructure,
  resumeActiveCall,
  savePendingCalls,
};