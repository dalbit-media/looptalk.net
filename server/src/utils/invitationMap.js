const MAX_NODES = 2000;
const CACHE_MS = 60_000;
const { randomInt, randomUUID } = require("node:crypto");
const { invitationTraffic } = require("./invitationTraffic");
const snapshotIds = new WeakMap();

const collectInvitationMap = async (prisma) => {
  const userWhere = { status: { not: "SYSTEM" } };
  const totalUsers = await prisma.user.count({ where: userWhere });
  const common = {
    totalUsers,
    maxNodes: MAX_NODES,
    generatedAt: new Date().toISOString(),
  };
  const users = await prisma.user.findMany({
    where: userWhere, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: MAX_NODES,
  });
  const ids = users.map((user) => user.id);
  const models = [prisma.invitation, prisma.privateInvitation];
  const batches = [];
  for (let offset = 0; offset < ids.length; offset += 400) batches.push(ids.slice(offset, offset + 400));
  const [edgeSets, missingCounts] = await Promise.all([
    Promise.all(models.map(async (model) => (await Promise.all(batches.map((batch) => model.findMany({
      where: { status: "ACCEPTED", acceptedById: { in: batch } },
      select: { inviterId: true, acceptedById: true },
      orderBy: { acceptedAt: "asc" }, take: batch.length,
    })))).flat())),
    Promise.all(models.map((model, index) => model.count({
      where: { status: "ACCEPTED", ...(index === 0 ? { acceptedById: null } :
        { OR: [{ acceptedById: null }, { inviterId: null }] }) },
    }))),
  ]);
  // Keep full account IDs private; only their final four characters are public.
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const publicIds = new Map(ids.map((id, index) => [id, index]));
  const nodes = ids.map((id, index) => ({ id: index, parentId: null, label: id.slice(-4) }));
  const components = nodes.map((node) => node.id);
  const root = (id) => {
    while (components[id] !== id) {
      components[id] = components[components[id]];
      id = components[id];
    }
    return id;
  };
  for (const edge of edgeSets.flat()) {
    const parentId = publicIds.get(edge.inviterId), childId = publicIds.get(edge.acceptedById);
    if (parentId === undefined || childId === undefined || nodes[childId].parentId !== null ||
        root(parentId) === root(childId)) continue;
    components[root(childId)] = root(parentId);
    nodes[childId].parentId = parentId;
  }
  const result = {
    ...common, mode: "live", limited: totalUsers > MAX_NODES,
    snapshotId: randomUUID(),
    historicalMissingLinks: missingCounts.reduce((total, count) => total + count, 0), nodes,
  };
  snapshotIds.set(result, publicIds);
  return result;
};

const createInvitationMapHandler = (prisma, traffic = invitationTraffic) => {
  let cached;
  let cachedAt = 0;
  let pending;
  const handler = async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!cached || Date.now() - cachedAt >= CACHE_MS) {
        if (!pending) {
          pending = collectInvitationMap(prisma).then((result) => {
            cached = result;
            cachedAt = Date.now();
          }).finally(() => { pending = null; });
        }
        await pending;
      }
      res.json(cached);
    } catch (error) {
      console.error("Error collecting public invitation map:", error);
      res.status(500).json({ error: "Failed to load invitation map" });
    }
  };
  handler.traffic = (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!/^\d{1,16}$/.test(req.query.after || "") || !Number.isSafeInteger(Number(req.query.after))) {
      return res.status(400).json({ error: "Invalid traffic cursor" });
    }
    if (!cached || req.query.snapshotId !== cached.snapshotId) {
      return res.status(409).json({ error: "Invitation snapshot changed; reload the map" });
    }
    res.json({
      snapshotId: cached.snapshotId,
      scope: "worker",
      ...traffic.read(snapshotIds.get(cached), Number(req.query.after)),
    });
  };
  return handler;
};

module.exports = { collectInvitationMap, createInvitationMapHandler, MAX_NODES };
