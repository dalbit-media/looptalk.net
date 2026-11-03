const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const DEFAULT_DATABASE_URL = "file:./looptalk.db";
const DEFAULT_DEVELOPMENT_JWT_SECRET =
  "looptalk-local-development-secret-only";

const applyEnvironmentDefaults = (environment = process.env) => {
  if (!environment.DATABASE_URL?.trim()) {
    environment.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
  if (
    environment.NODE_ENV !== "production" &&
    !environment.JWT_SECRET?.trim()
  ) {
    environment.JWT_SECRET = DEFAULT_DEVELOPMENT_JWT_SECRET;
  }
  return environment;
};

const isSet = (value) => Boolean(value?.trim());

// Secrets the operator did not set are generated once and kept beside the SQLite file, so a
// deployment only needs a persistent database directory. Explicit environment values always win.
const provisionSecrets = (environment = process.env) => {
  const { databasePath } = require("../utils/appState");
  let database;
  try { database = databasePath(environment); } catch { return environment; }
  const file = `${database}.secrets.json`;
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const generated = {};
  const provide = (name, create) => {
    if (isSet(environment[name])) return;
    if (isSet(stored[name])) environment[name] = stored[name];
    else if (create) environment[name] = generated[name] = create();
  };
  // A new user-data key would make existing encrypted rows unreadable, so only a new database gets one.
  const freshDatabase = !fs.existsSync(database) || fs.statSync(database).size === 0;
  provide("USER_DATA_ENCRYPTION_KEY", freshDatabase && (() => crypto.randomBytes(32).toString("base64")));
  provide("JWT_SECRET", () => crypto.randomBytes(48).toString("base64url"));
  if (!isSet(environment.VAPID_PUBLIC_KEY) && !isSet(environment.VAPID_PRIVATE_KEY)) {
    if (!isSet(stored.VAPID_PUBLIC_KEY)) {
      const { publicKey, privateKey } = require("web-push").generateVAPIDKeys();
      stored = { ...stored, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey };
      Object.assign(generated, { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey });
    }
    environment.VAPID_PUBLIC_KEY = stored.VAPID_PUBLIC_KEY;
    environment.VAPID_PRIVATE_KEY = stored.VAPID_PRIVATE_KEY;
  }
  if (Object.keys(generated).length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ ...stored, ...generated }, null, 2)}\n`, { mode: 0o600 });
  }
  return environment;
};

const loadEnvironment = () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });
  applyEnvironmentDefaults();
  return provisionSecrets();
};

module.exports = {
  DEFAULT_DATABASE_URL,
  DEFAULT_DEVELOPMENT_JWT_SECRET,
  applyEnvironmentDefaults,
  loadEnvironment,
  provisionSecrets,
};
