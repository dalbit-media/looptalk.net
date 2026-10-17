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

const loadEnvironment = () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });
  return applyEnvironmentDefaults();
};

module.exports = {
  DEFAULT_DATABASE_URL,
  DEFAULT_DEVELOPMENT_JWT_SECRET,
  applyEnvironmentDefaults,
  loadEnvironment,
};
