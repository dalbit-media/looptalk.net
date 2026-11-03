const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const encryptionKey = require("node:crypto").randomBytes(32).toString("base64");
const { validateEnvironment } = require("../src/config/environment");

test("validation alone does not invent an encryption key for the example environment", () => {
  const exampleEnvironment = dotenv.parse(
    fs.readFileSync(path.join(__dirname, "../.env.example"))
  );
  assert.throws(() => validateEnvironment(exampleEnvironment), /USER_DATA_ENCRYPTION_KEY/);
  assert.doesNotThrow(() => validateEnvironment({ ...exampleEnvironment, USER_DATA_ENCRYPTION_KEY: encryptionKey }));
});

test("defaults local database and JWT settings", () => {
  const environment = { USER_DATA_ENCRYPTION_KEY: encryptionKey };
  assert.doesNotThrow(() => validateEnvironment(environment));
  assert.equal(environment.DATABASE_URL, "file:./looptalk.db");
  assert.equal(environment.JWT_SECRET, "looptalk-local-development-secret-only");
});

test("requires the JWT secret in production", () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: "production" }),
    /JWT_SECRET/
  );
});

const validEnvironment = {
  USER_DATA_ENCRYPTION_KEY: encryptionKey,
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
  const environment = { USER_DATA_ENCRYPTION_KEY: encryptionKey };
  assert.doesNotThrow(() => validateEnvironment(environment));
  assert.equal(environment.DATABASE_URL, "file:./looptalk.db");
});

test("requires SQLite", () => {
  assert.throws(
    () => validateEnvironment({ ...validEnvironment, DATABASE_URL: "mysql://user:password@db.example.com:3306/looptalk" }),
    /SQLite file URL/
  );
});

test("rejects weak secrets", () => {
  for (const key of ["", "weak", Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64")]) {
    assert.throws(() => validateEnvironment({ ...validEnvironment, USER_DATA_ENCRYPTION_KEY: key }), /USER_DATA_ENCRYPTION_KEY/);
  }
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
test("provisions missing secrets once beside the database and keeps explicit values", () => {
  const os = require("node:os");
  const { provisionSecrets } = require("../src/config/load-environment");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "looptalk-secrets-"));
  const database = path.join(directory, "looptalk.db");
  const secretsFile = `${database}.secrets.json`;
  try {
    const first = provisionSecrets({ NODE_ENV: "production", DATABASE_URL: `file:${database}` });
    assert.doesNotThrow(() => validateEnvironment(first));
    assert.ok(first.VAPID_PUBLIC_KEY && first.VAPID_PRIVATE_KEY);
    const stored = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
    assert.equal(stored.USER_DATA_ENCRYPTION_KEY, first.USER_DATA_ENCRYPTION_KEY);

    fs.writeFileSync(database, "existing data");
    const second = provisionSecrets({ NODE_ENV: "production", DATABASE_URL: `file:${database}` });
    for (const name of ["JWT_SECRET", "USER_DATA_ENCRYPTION_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
      assert.equal(second[name], first[name]);
    }

    const explicit = provisionSecrets({
      DATABASE_URL: `file:${database}`, JWT_SECRET: "explicit-secret-with-at-least-32-characters",
      USER_DATA_ENCRYPTION_KEY: encryptionKey,
    });
    assert.equal(explicit.JWT_SECRET, "explicit-secret-with-at-least-32-characters");
    assert.equal(explicit.USER_DATA_ENCRYPTION_KEY, encryptionKey);

    fs.rmSync(secretsFile);
    const orphaned = provisionSecrets({ NODE_ENV: "production", DATABASE_URL: `file:${database}` });
    assert.equal(orphaned.USER_DATA_ENCRYPTION_KEY, undefined, "never replaces the key of an existing database");
    assert.throws(() => validateEnvironment(orphaned), /USER_DATA_ENCRYPTION_KEY/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("social sign-in audiences default to the app's own client IDs", () => {
  const { audiencesFor } = require("../src/utils/socialIdentity");
  const google = { audiences: "GOOGLE_CLIENT_IDS", defaults: (env) => [env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID] };
  assert.deepEqual(audiencesFor(google, { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-id" }), ["web-id"]);
  assert.deepEqual(audiencesFor(google, { GOOGLE_CLIENT_IDS: "a, b", EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-id" }), ["a", "b"]);
  assert.deepEqual(audiencesFor(google, { GOOGLE_CLIENT_IDS: "", EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-id" }), []);
});
