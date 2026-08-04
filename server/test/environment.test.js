const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvironment } = require("../src/config/environment");

test("requires the database URL and JWT secret", () => {
  assert.throws(
    () => validateEnvironment({}),
    /DATABASE_URL, JWT_SECRET/
  );
});

const validEnvironment = {
  DATABASE_URL: "file:./dev.db",
  JWT_SECRET: "a-strong-secret-with-at-least-32-characters",
  CORS_ORIGIN: "https://app.looptalk.example",
  PUBLIC_URL: "https://api.looptalk.example",
  TURN_URLS: "turns:turn.looptalk.example:5349",
  TURN_SECRET: "a-private-coturn-authentication-secret",
  ADMIN_USER_IDS: "moderator-user-id",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
  APPLE_TEAM_ID: "ABCDE12345",
  ANDROID_CERT_SHA256: "AA:BB:CC:DD",
};

test("accepts the documented configuration", () => {
  assert.doesNotThrow(() => validateEnvironment(validEnvironment));
});

test("accepts a minimal configuration", () => {
  assert.doesNotThrow(() =>
    validateEnvironment({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      JWT_SECRET: validEnvironment.JWT_SECRET,
    })
  );
});

test("requires SQLite", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, DATABASE_URL: "mysql://user:password@db.example.com:3306/looptalk" }),
    /SQLite file URL/
  );
});

test("rejects weak secrets", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, JWT_SECRET: "too-short" }),
    /strong secret/
  );
});

test("validates configured public and CORS URLs", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, PUBLIC_URL: "localhost" }),
    /PUBLIC_URL must be a valid URL/
  );
  assert.throws(
    () => validateEnvironment({
      ...validEnvironment,
      CORS_ORIGIN: "file:///looptalk",
    }),
    /CORS_ORIGIN entries must use HTTP or HTTPS/
  );
  assert.doesNotThrow(() => validateEnvironment({
    ...validEnvironment,
    PUBLIC_URL: "http://localhost:3000",
    CORS_ORIGIN: "http://localhost:3000",
  }));
});

test("requires Redis for multiple instances", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, INSTANCE_COUNT: "2" }),
    /REDIS_URL is required/
  );
  assert.doesNotThrow(() =>
    validateEnvironment({
      ...validEnvironment,
      INSTANCE_COUNT: "2",
      REDIS_URL: "redis://redis.internal:6379",
    })
  );
});

test("requires TURN relay configuration", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, TURN_SECRET: "" }),
    /TURN_URLS and TURN_SECRET must be configured together/
  );
});