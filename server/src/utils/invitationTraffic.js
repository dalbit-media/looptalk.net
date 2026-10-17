const RETENTION_MS = 10_000;
const MAX_EVENTS = 2000;

const createInvitationTraffic = ({ now = Date.now } = {}) => {
  let sequence = 0;
  let events = [];
  const prune = () => {
    const cutoff = now() - RETENTION_MS;
    events = events.filter((event) => event.at > cutoff).slice(-MAX_EVENTS);
  };
  return {
    record(userId, direction, bytes) {
      if (typeof userId !== "string" || !["in", "out"].includes(direction) ||
          !Number.isSafeInteger(bytes) || bytes <= 0) {
        throw new Error("Invalid invitation traffic sample");
      }
      events.push({ sequence: ++sequence, at: now(), userId, direction, bytes });
      prune();
    },
    read(publicIds, after) {
      prune();
      const nodes = new Map();
      for (const event of events) {
        const id = publicIds.get(event.userId);
        if (event.sequence <= after || id === undefined) continue;
        if (!nodes.has(id)) nodes.set(id, { id, inBytes: 0, outBytes: 0 });
        nodes.get(id)[`${event.direction}Bytes`] += event.bytes;
      }
      return { cursor: sequence, nodes: [...nodes.values()] };
    },
  };
};

const invitationTraffic = createInvitationTraffic();
module.exports = { createInvitationTraffic, invitationTraffic };
