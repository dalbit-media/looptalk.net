const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const { userDataKey } = require("../src/utils/privateAccounts");

const configurePrivacyKey = ({
  envFile = path.resolve(__dirname, "../.env"), environment = process.env,
} = {}) => {
  const lockFile = `${envFile}.privacy-key.lock`;
  const lock = fs.openSync(lockFile, "wx", 0o600);
  try {
    let contents = "";
    try { contents = fs.readFileSync(envFile, "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parsed = dotenv.parse(contents);
    const name = "USER_DATA_ENCRYPTION_KEY";
    const hasFileKey = Object.hasOwn(parsed, name);
    const hasEnvironmentKey = Object.hasOwn(environment, name);
    if (hasFileKey) userDataKey(parsed);
    if (hasEnvironmentKey) userDataKey(environment);
    if (hasFileKey && hasEnvironmentKey && parsed[name] !== environment[name]) {
      throw new Error("USER_DATA_ENCRYPTION_KEY differs between environment and .env; refusing to change configuration");
    }
    if (!hasFileKey && !hasEnvironmentKey) {
      const key = crypto.randomBytes(32).toString("base64");
      fs.appendFileSync(envFile, `${contents && !contents.endsWith("\n") ? "\n" : ""}${name}="${key}"\n`,
        { mode: 0o600 });
    }
    if (process.platform !== "win32" && fs.existsSync(envFile)) fs.chmodSync(envFile, 0o600);
    return envFile;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
};

if (require.main === module) {
  try {
    console.log(`configured ${configurePrivacyKey()}`);
  } catch (error) {
    console.error(error.code === "EEXIST" ? "Privacy key setup is already running" :
      (error.message.includes("USER_DATA_ENCRYPTION_KEY") ? error.message : "Privacy key setup failed"));
    process.exitCode = 1;
  }
}

module.exports = { configurePrivacyKey };
