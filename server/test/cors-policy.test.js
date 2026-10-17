const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { createCorsPolicy } = require("../src/utils/corsPolicy");

test("production same-origin credential sessions connect over polling and WebSocket without an allowlist", async (t) => {
  const app = express();
  const policy = createCorsPolicy({ environment: { NODE_ENV: "production" } });
  app.use(cors(policy));
  app.get("/health", (req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  const io = new Server(server, { cors: policy });
  const secret = crypto.randomBytes(32).toString("base64");
  const userId = `u_${crypto.randomBytes(16).toString("hex")}`;
  io.use((socket, next) => {
    try {
      socket.userId = jwt.verify(socket.handshake.auth?.token, secret).id;
      next();
    } catch { next(new Error("Unauthorized")); }
  });
  io.on("connection", (socket) => socket.on("identity", (ack) => ack(socket.userId)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => io.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/health`, { headers: { Origin: origin } })).status, 200);
  for (const transport of ["polling", "websocket"]) {
    await t.test(transport, async () => {
      const socket = connect(origin, {
        transports: [transport], forceNew: true, reconnection: false,
        extraHeaders: { Origin: origin }, auth: { token: jwt.sign({ id: userId }, secret) },
      });
      try {
        await new Promise((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        });
        assert.equal(await socket.timeout(2000).emitWithAck("identity"), userId);
      } finally { socket.disconnect(); }
    });
  }
  const forbidden = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(forbidden.status, 400);
});

test("CORS permits only same-origin, explicit public/allowlisted origins, and development loopbacks", async () => {
  const allows = (environment, origin, host = "internal:3131", encrypted = false) => new Promise((resolve, reject) => {
    createCorsPolicy({ environment })({ headers: { host }, socket: { encrypted } }, (error, options) => {
      if (error) return reject(error);
      options.origin(origin, (failure, allowed) => resolve(!failure && allowed));
    });
  });
  const production = { NODE_ENV: "production", PUBLIC_URL: "https://public.example" };
  assert.equal(await allows(production, "https://public.example"), true);
  assert.equal(await allows(production, "http://internal:3131"), true);
  assert.equal(await allows(production, undefined), true);
  assert.equal(await allows(production, "https://internal:3131"), false);
  assert.equal(await allows(production, "https://internal:3131", "internal:3131", true), true);
  assert.equal(await allows(production, "http://127.0.0.1:3131"), false);
  assert.equal(await allows(production, "null"), false);
  assert.equal(await allows(production, "not a URL"), false);
  assert.equal(await allows({ ...production, CORS_ORIGIN: "https://client.example, https://other.example" },
    "https://other.example"), true);
  assert.equal(await allows({ NODE_ENV: "development" }, "http://127.0.0.1:3131"), true);
  assert.equal(await allows({ NODE_ENV: "development" }, "http://[::1]:3131"), true);
});
