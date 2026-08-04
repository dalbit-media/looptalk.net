const { createAdapter } = require("@socket.io/redis-streams-adapter");
const { createClient } = require("redis");

const PENDING_CALL_TTL_SECONDS = 50;
const localPendingCalls = new Map();
let redisClient = null;

const pendingCallKey = (userId, callId) => `looptalk:pending-call:${userId}:${callId}`;

const initializeCallInfrastructure = async (io) => {
  if (!process.env.REDIS_URL) return;
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => console.error("Redis error:", error));
  await redisClient.connect();
  io.adapter(createAdapter(redisClient));
  console.log("Socket.IO Redis Streams adapter connected");
};

const savePendingCalls = async (recipientIds, call) => {
  const expiresAt = Date.now() + PENDING_CALL_TTL_SECONDS * 1000;
  if (redisClient) {
    await Promise.all(
      recipientIds.map((userId) =>
        redisClient.set(pendingCallKey(userId, call.callId), JSON.stringify(call), {
          EX: PENDING_CALL_TTL_SECONDS,
        })
      )
    );
    return;
  }
  recipientIds.forEach((userId) => {
    const calls = localPendingCalls.get(userId) || new Map();
    calls.set(call.callId, { ...call, expiresAt });
    localPendingCalls.set(userId, calls);
  });
};

const getPendingCalls = async (userId) => {
  if (redisClient) {
    const calls = [];
    for await (const key of redisClient.scanIterator({
      MATCH: pendingCallKey(userId, "*"),
      COUNT: 20,
    })) {
      const value = await redisClient.get(key);
      if (value) calls.push(JSON.parse(value));
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

const closeCallInfrastructure = async () => {
  if (redisClient?.isOpen) await redisClient.close();
};

module.exports = {
  clearPendingCall,
  closeCallInfrastructure,
  getPendingCalls,
  initializeCallInfrastructure,
  savePendingCalls,
};