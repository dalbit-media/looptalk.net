const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const express = require("express");
const jwt = require("jsonwebtoken");

test("poll forum persistence, validation and participation access with isolated SQLite", { timeout: 180000 }, async (t) => {
  const directory = path.join(__dirname, `.forum-${crypto.randomUUID()}`);
  await fs.mkdir(directory);
  const schemaPath = path.join(directory, "schema.prisma");
  const schema = await fs.readFile(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  await fs.writeFile(schemaPath, schema.replace('provider = "prisma-client-js"',
    'provider = "prisma-client-js"\n  output = "./client"\n  engineType = "binary"'));
  const env = { ...process.env, DATABASE_URL: `file:${path.join(directory, "forum.db")}` };
  let prisma, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (prisma) await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });
  for (const args of [["generate"], ["db", "push", "--skip-generate"]]) {
    const result = spawnSync(process.execPath, [
      require.resolve("prisma/build/index.js"), ...args, "--schema", schemaPath,
    ], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const { PrismaClient } = require(path.join(directory, "client"));
  prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  require.cache[require.resolve("../src/db/client")] = { exports: prisma };
  process.env.JWT_SECRET = "isolated-forum-test-secret";
  const app = express();
  app.use(express.json());
  app.use("/api/forum", require("../src/routes/forum"));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}/api/forum`;
  const request = async (url, user = "alice", method = "GET", body) => {
    const response = await fetch(origin + url, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET)}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.ok(!JSON.stringify(data).includes("PRIVATE_PROFILE"));
    if (user) assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, data };
  };
  for (const id of ["alice", "bob", "carol"]) {
    await prisma.user.create({ data: {
      id, username: id, displayName: "PRIVATE_PROFILE", publicUsername: `${id}-public`, publicDisplayName: `${id} public`,
    } });
  }
  let poll, second;

  await t.test("all forum operations require authentication", async () => {
    for (const [url, method, body] of [
      ["/polls", "GET"], ["/polls", "POST", { question: "Question?", options: ["A", "B"] }],
      ["/polls/missing", "GET"], ["/polls/missing/vote", "POST", { optionId: "missing" }],
      ["/polls/missing/comments", "GET"], ["/polls/missing/comments", "POST", { content: "Hidden" }],
    ]) assert.equal((await request(url, null, method, body)).status, 401);
  });

  await t.test("creation validates exact limits, distinct options and types", async () => {
    for (const body of [
      {}, { question: " ", options: ["A", "B"] }, { question: "x".repeat(301), options: ["A", "B"] },
      { question: "Q", options: [] }, { question: "Q", options: Array.from({ length: 11 }, (_, i) => `${i}`) },
      { question: "Q", options: [" a ", "A"] }, { question: "Q", options: ["A", " "] },
      { question: "Q", options: ["A", 5] }, { question: "Q", options: ["A", "x".repeat(121)] },
    ]) assert.equal((await request("/polls", "alice", "POST", body)).status, 400);
    const result = await request("/polls", "alice", "POST", { question: " Best choice? ", options: [" First ", "Second"] });
    assert.equal(result.status, 201);
    poll = result.data;
    assert.equal(poll.question, "Best choice?");
    assert.deepEqual(poll.options.map((option) => option.text), ["First", "Second"]);
    assert.deepEqual(poll.author, { id: "alice", name: "alice public" });
    assert.equal(poll.myOptionId, null);
    assert.equal(Object.hasOwn(poll, "results"), false);
    second = (await request("/polls", "bob", "POST", {
      question: "Q".repeat(300), options: Array.from({ length: 10 }, (_, i) => `${i}${"a".repeat(119)}`),
    })).data;
    assert.equal(second.options.length, 10);
    const single = await request("/polls", "bob", "POST", { question: "Just a thought", options: ["Support"] });
    assert.equal(single.status, 201);
    assert.deepEqual(single.data.options.map((option) => option.text), ["Support"]);
    await prisma.forumPoll.delete({ where: { id: single.data.id } });
  });

  await t.test("creators and other nonvoters cannot see results or read/write comments", async () => {
    for (const user of ["alice", "bob", "carol"]) {
      const detail = await request(`/polls/${poll.id}`, user);
      assert.equal(detail.status, 200);
      assert.equal(detail.data.myOptionId, null);
      assert.equal(Object.hasOwn(detail.data, "results"), false);
      assert.equal(Object.hasOwn(detail.data, "totalVotes"), false);
      assert.equal(Object.hasOwn(detail.data, "comments"), false);
      for (const method of ["GET", "POST"]) {
        const result = await request(`/polls/${poll.id}/comments`, user, method, method === "POST" ? { content: "Forbidden" } : undefined);
        assert.equal(result.status, 403);
        assert.equal(result.data.code, "PARTICIPATION_REQUIRED");
      }
    }
    assert.equal(await prisma.forumComment.count(), 0);
  });

  await t.test("invalid options and cross-poll votes are rejected, including by the database", async () => {
    for (const optionId of [null, 7, "", "missing", second.options[0].id]) {
      assert.equal((await request(`/polls/${poll.id}/vote`, "alice", "POST", { optionId })).status, 400);
    }
    await assert.rejects(prisma.forumVote.create({
      data: { pollId: poll.id, optionId: second.options[0].id, userId: "alice" },
    }), { code: "P2003" });
    assert.equal(await prisma.forumVote.count(), 0);
  });

  await t.test("voting unlocks correct totals and comments only for that poll", async () => {
    assert.equal((await request(`/polls/${poll.id}/vote`, "alice", "POST", { optionId: poll.options[0].id })).status, 201);
    const result = await request(`/polls/${poll.id}`);
    assert.equal(result.data.myOptionId, poll.options[0].id);
    assert.equal(result.data.totalVotes, 1);
    assert.deepEqual(result.data.results, [
      { optionId: poll.options[0].id, votes: 1 }, { optionId: poll.options[1].id, votes: 0 },
    ]);
    assert.equal((await request(`/polls/${second.id}/comments`)).status, 403);
    assert.equal(Object.hasOwn((await request(`/polls/${second.id}`)).data, "results"), false);
    assert.equal(Object.hasOwn((await request(`/polls/${poll.id}`, "bob")).data, "results"), false);
    const list = (await request("/polls?scope=loop")).data;
    assert.ok(list.polls.every((item) => !["results", "totalVotes", "votes", "comments", "_count"].some((key) => Object.hasOwn(item, key))));
    assert.equal(list.polls.find((item) => item.id === poll.id).myOptionId, poll.options[0].id);
  });

  await t.test("duplicate and concurrent votes are final and counted exactly once", async () => {
    assert.equal((await request(`/polls/${poll.id}/vote`, "alice", "POST", { optionId: poll.options[1].id })).status, 409);
    const votes = await Promise.all(poll.options.map((option) =>
      request(`/polls/${poll.id}/vote`, "bob", "POST", { optionId: option.id })));
    assert.deepEqual(votes.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await prisma.forumVote.count({ where: { pollId: poll.id } }), 2);
    const detail = (await request(`/polls/${poll.id}`)).data;
    assert.equal(detail.totalVotes, 2);
    assert.equal(detail.results.reduce((sum, item) => sum + item.votes, 0), 2);
  });

  await t.test("voters can discuss results; nonvoters cannot access existing comments", async () => {
    for (const content of ["", " ", 42, "x".repeat(2001)]) {
      assert.equal((await request(`/polls/${poll.id}/comments`, "bob", "POST", { content })).status, 400);
    }
    const posted = await request(`/polls/${poll.id}/comments`, "bob", "POST", { content: " A useful result! " });
    assert.equal(posted.status, 201);
    assert.equal(posted.data.content, "A useful result!");
    assert.deepEqual(posted.data.author, { id: "bob", name: "bob public" });
    assert.equal((await request(`/polls/${poll.id}/comments`)).data.comments[0].id, posted.data.id);
    assert.equal((await request(`/polls/${poll.id}/comments`, "carol")).status, 403);
    assert.equal((await request(`/polls/${poll.id}/comments`, "carol", "POST", { content: "No access" })).status, 403);
    assert.equal(Object.hasOwn((await request(`/polls/${poll.id}`, "carol")).data, "totalVotes"), false);
    assert.equal((await request(`/polls/${poll.id}/comments`, "alice", "POST", { content: "x".repeat(2000) })).status, 201);
  });

  await t.test("posts default to contacts, authors can toggle visibility, and the public list hides contact posts", async () => {
    assert.equal(poll.visibility, "contacts");
    const publicPoll = (await request("/polls", "carol", "POST", {
      question: "Open?", options: ["Support"], visibility: "public",
    })).data;
    assert.equal(publicPoll.visibility, "public");
    assert.equal((await request("/polls", "carol", "POST", { question: "Q", options: ["A"], visibility: "everyone" })).status, 400);
    let ids = (await request("/polls", "bob")).data.polls.map((item) => item.id);
    assert.ok(ids.includes(publicPoll.id));
    assert.ok(!ids.includes(poll.id));
    assert.ok((await request("/polls?scope=loop", "bob")).data.polls.some((item) => item.id === poll.id));
    assert.equal((await request("/polls?scope=other")).status, 400);
    assert.equal((await request(`/polls/${poll.id}/visibility`, "bob", "PATCH", { visibility: "public" })).status, 403);
    assert.equal((await request(`/polls/${poll.id}/visibility`, "alice", "PATCH", { visibility: "nobody" })).status, 400);
    assert.equal((await request("/polls/missing/visibility", "alice", "PATCH", { visibility: "public" })).status, 404);
    assert.equal((await request(`/polls/${poll.id}/visibility`, "alice", "PATCH", { visibility: "public" })).status, 200);
    ids = (await request("/polls", "bob")).data.polls.map((item) => item.id);
    assert.ok(ids.includes(poll.id));
    assert.equal((await request(`/polls/${poll.id}/visibility`, "alice", "PATCH", { visibility: "contacts" })).status, 200);
    assert.equal((await request(`/polls/${poll.id}`, "alice")).data.visibility, "contacts");
    await prisma.forumPoll.delete({ where: { id: publicPoll.id } });
  });

  await t.test("network level is members-only and guests only see and post public content", async () => {
    await prisma.user.create({ data: { id: "guest", username: "guest", displayName: "x", publicUsername: "guest-public", isMember: false } });
    const networkPoll = (await request("/polls", "carol", "POST", { question: "Net?", options: ["Support"], visibility: "network" })).data;
    const publicPoll = (await request("/polls", "carol", "POST", { question: "Pub?", options: ["Support"], visibility: "public" })).data;
    assert.equal(networkPoll.visibility, "network");
    const listed = async (scope, user) => (await request(`/polls?scope=${scope}`, user)).data.polls.map((item) => item.id);
    assert.deepEqual((await listed("network", "bob")).filter((id) => [networkPoll.id, publicPoll.id].includes(id)), [networkPoll.id]);
    assert.ok(!(await listed("public", "bob")).includes(networkPoll.id));
    assert.deepEqual(await listed("public", "guest"), [publicPoll.id]);
    for (const scope of ["network", "loop"]) assert.equal((await request(`/polls?scope=${scope}`, "guest")).status, 403);
    assert.equal((await request(`/polls/${networkPoll.id}`, "guest")).status, 404);
    assert.equal((await request(`/polls/${publicPoll.id}`, "guest")).status, 200);
    const option = publicPoll.options[0].id;
    assert.equal((await request(`/polls/${publicPoll.id}/vote`, "guest", "POST", { optionId: option })).status, 403);
    assert.equal((await request(`/polls/${publicPoll.id}/comments`, "guest")).status, 403);
    assert.equal((await request("/polls", "guest", "POST", { question: "Q", options: ["A"] })).status, 403);
    assert.equal((await request("/polls", "guest", "POST", { question: "Q", options: ["A"], visibility: "network" })).status, 403);
    const guestPost = await request("/polls", "guest", "POST", { question: "Hello", options: ["Support"], visibility: "public" });
    assert.equal(guestPost.status, 201);
    assert.equal((await request(`/polls/${guestPost.data.id}/visibility`, "guest", "PATCH", { visibility: "contacts" })).status, 403);
    await prisma.user.delete({ where: { id: "guest" } });
    await prisma.forumPoll.deleteMany({ where: { id: { in: [networkPoll.id, publicPoll.id] } } });
  });

  await t.test("poll and comment pagination is bounded and stable, invalid pages and missing polls are explicit", async () => {
    for (const page of ["0", "-1", "1.5", "abc", "1000000"]) {
      assert.equal((await request(`/polls?page=${page}`)).status, 400);
      assert.equal((await request(`/polls/${poll.id}/comments?page=${page}`)).status, 400);
    }
    for (const [suffix, method, body] of [
      ["", "GET"], ["/comments", "GET"], ["/vote", "POST", { optionId: poll.options[0].id }],
      ["/comments", "POST", { content: "Hello" }],
    ]) assert.equal((await request(`/polls/missing${suffix}`, "carol", method, body)).status, 404);
    for (let i = 0; i < 21; i++) {
      await prisma.forumPoll.create({ data: { question: `Extra ${i}`, authorId: "alice", options: { create: [
        { text: "A", position: 0 }, { text: "B", position: 1 },
      ] } } });
      await prisma.forumComment.create({ data: { pollId: poll.id, authorId: "alice", content: `Comment ${i}` } });
    }
    for (const [url, key] of [["/polls?scope=loop", "polls"], [`/polls/${poll.id}/comments`, "comments"]]) {
      const first = (await request(url)).data;
      const next = (await request(`${url}${url.includes("?") ? "&" : "?"}page=2`)).data;
      assert.equal(first[key].length, 20);
      assert.equal(first.hasMore, true);
      assert.equal(next[key].length, 3);
      assert.equal(next.hasMore, false);
      assert.equal(new Set([...first[key], ...next[key]].map((item) => item.id)).size, 23);
    }
    await prisma.$disconnect();
    assert.equal((await request(`/polls/${poll.id}`)).data.totalVotes, 2, "Votes survive reconnecting to SQLite");
  });

  await t.test("additive migration preserves users and creates the exact forum schema", async () => {
    const legacySchema = schema.replace(/^  forum(Polls|Votes|Comments).*\r?\n/gm, "").replace(/^  isMember .*\r?\n/m, "")
      .replace(/model Forum(Poll|Option|Vote|Comment) \{[^}]+\}\r?\n/g, "");
    const legacyPath = path.join(directory, "legacy.prisma");
    await fs.writeFile(legacyPath, legacySchema);
    const url = `file:${path.join(directory, "legacy.db")}`;
    const pushed = spawnSync(process.execPath, [
      require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", legacyPath,
    ], { env: { ...env, DATABASE_URL: url }, encoding: "utf8" });
    assert.equal(pushed.status, 0, pushed.stderr || pushed.stdout);
    const legacy = new PrismaClient({ datasources: { db: { url } } });
    try {
      await legacy.$executeRawUnsafe(`INSERT INTO "User" ("id","username","displayName","updatedAt") VALUES ('retained','retained','Unchanged',CURRENT_TIMESTAMP)`);
      const sql = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261018070000_poll_forum", "migration.sql"), "utf8");
      const visibilitySql = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261029000000_forum_visibility", "migration.sql"), "utf8");
      const membershipSql = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations",
        "20261030000000_user_membership", "migration.sql"), "utf8");
      for (const statement of `${sql};${visibilitySql};${membershipSql}`.split(";").map((value) => value.trim()).filter(Boolean)) {
        await legacy.$executeRawUnsafe(statement);
      }
      assert.equal((await legacy.user.findUnique({ where: { id: "retained" } })).isMember, true);
      assert.equal((await legacy.user.findUnique({ where: { id: "retained" } })).displayName, "Unchanged");
      const created = await legacy.forumPoll.create({ data: {
        authorId: "retained", question: "Migrated?", options: { create: [{ text: "Yes", position: 0 }, { text: "No", position: 1 }] },
      }, include: { options: true } });
      await legacy.forumVote.create({ data: { pollId: created.id, optionId: created.options[0].id, userId: "retained" } });
      await legacy.forumComment.create({ data: { pollId: created.id, authorId: "retained", content: "Works" } });
      assert.equal(await legacy.forumVote.count(), 1);
    } finally {
      await legacy.$disconnect();
    }
  });

  await t.test("account deletion cascades forum content without orphaned votes or comments", async () => {
    await prisma.user.delete({ where: { id: "bob" } });
    assert.equal(await prisma.forumPoll.count({ where: { id: second.id } }), 0);
    assert.equal(await prisma.forumVote.count({ where: { userId: "bob" } }), 0);
    assert.equal(await prisma.forumComment.count({ where: { authorId: "bob" } }), 0);
    await prisma.user.delete({ where: { id: "alice" } });
    for (const model of ["forumPoll", "forumOption", "forumVote", "forumComment"]) assert.equal(await prisma[model].count(), 0);
  });
});
