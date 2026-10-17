const createPresenceService = ({ io, prisma, now = () => new Date() }) => {
  const readOnlineUsers = async () => {
    const sockets = await io.fetchSockets();
    const users = new Map();
    sockets.forEach(({ data }) => {
      if (!data.userId || !data.presenceActive) return;
      const previous = users.get(data.userId);
      if (!previous || data.lastActiveAt > previous.lastActiveAt) {
        users.set(data.userId, {
          userId: data.userId,
          status: "online",
          ...(data.privateAccount ? {} : { lastActiveAt: data.lastActiveAt || null }),
        });
      }
    });
    if (!users.size) return [];
    const accounts = await prisma.user.findMany({
      where: { id: { in: [...users.keys()] } },
      select: { id: true, authPublicKey: true },
    });
    return accounts.map((account) => account.authPublicKey
      ? { userId: account.id, status: "online" }
      : users.get(account.id));
  };

  const publish = async (socket, wasActive) => {
    const userId = socket.data.userId;
    const owner = await prisma.user.findUnique({
      where: { id: userId }, select: { authPublicKey: true },
    });
    if (!owner) return;
    if (owner.authPublicKey) {
      socket.data.privateAccount = true;
      delete socket.data.lastActiveAt;
      const sockets = await io.in(`user_${userId}`).fetchSockets();
      io.emit("user_status_changed", {
        userId,
        status: sockets.some(({ data }) => data.presenceActive) ? "online" : "offline",
      });
      return;
    }
    socket.data.privateAccount = false;
    if (wasActive || socket.data.presenceActive) {
      const lastActiveAt = now();
      socket.data.lastActiveAt = lastActiveAt.toISOString();
      await prisma.user.updateMany({
        where: {
          id: userId,
          authPublicKey: null,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: lastActiveAt } }],
        },
        data: { lastActiveAt },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true, authPublicKey: true },
    });
    if (!user || user.authPublicKey) return;
    const sockets = await io.in(`user_${userId}`).fetchSockets();
    const isOnline = sockets.some(({ data }) => data.presenceActive);
    io.emit("user_status_changed", {
      userId,
      status: isOnline ? "online" : "offline",
      lastActiveAt: user.lastActiveAt?.toISOString() || null,
    });
  };

  return {
    connect: async (socket) => {
      socket.data.userId = socket.userId;
      socket.data.privateAccount = true;
      socket.data.presenceActive = socket.handshake.auth.presenceActive !== false;
      await publish(socket, false);
      if (socket.connected) {
        socket.emit("presence_snapshot", { users: await readOnlineUsers() });
      }
    },
    setActive: async (socket, status) => {
      if (status !== "online" && status !== "offline") {
        throw new Error("Invalid presence status");
      }
      const wasActive = socket.data.presenceActive;
      socket.data.presenceActive = status === "online";
      await publish(socket, wasActive);
    },
    disconnect: async (socket) => {
      const wasActive = socket.data.presenceActive;
      socket.data.presenceActive = false;
      await publish(socket, wasActive);
    },
  };
};

module.exports = { createPresenceService };
