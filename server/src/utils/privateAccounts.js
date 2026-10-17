const crypto = require("node:crypto");
const publicIdentity = Symbol("publicIdentity");

const normalizeIdentifier = (value) => {
  if (typeof value !== "string" || value.length > 254) return null;
  const identifier = value.trim().toLowerCase();
  if (identifier.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? identifier : null;
  }
  const phone = identifier.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
};
const userDataKey = (environment = process.env) => {
  const key = decodeBase64(environment.USER_DATA_ENCRYPTION_KEY, 32);
  if (!key) throw new Error("USER_DATA_ENCRYPTION_KEY must be configured as 32 bytes of canonical base64");
  return key;
};
const contactLookup = (identifier) => crypto.createHmac("sha256", userDataKey())
  .update("looptalk:contact-lookup:v1\0").update(identifier).digest("hex");
const syntheticSalt = (identifier) => crypto.createHmac("sha256", userDataKey())
  .update("looptalk:credential-salt:v1\0").update(identifier).digest().subarray(0, 16).toString("base64");
const credentialFields = (identifier, salt) => {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized || !decodeBase64(salt, 16)) return null;
  const lookup = contactLookup(normalized);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", userDataKey(), nonce);
  cipher.setAAD(Buffer.from(`looptalk:identifier:v1:${lookup}`));
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return {
    credentialSalt: salt, contactLookup: lookup,
    encryptedIdentifier: JSON.stringify({
      version: 1, nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    }),
  };
};

const upgradeRequired = (res) => res.status(426).json({
  error: "Owner-encrypted personal data is required. Upgrade your client.",
  code: "PRIVATE_ACCOUNT_REQUIRED",
});
const decodeBase64 = (value, min, max = min) => {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.length >= min && bytes.length <= max && bytes.toString("base64") === value ? bytes : null;
};
const validVault = (vault) => vault && typeof vault === "object" &&
  Object.keys(vault).sort().join(",") === "ciphertext,nonce,version" &&
  vault.version === 1 && !!decodeBase64(vault.nonce, 24) &&
  !!decodeBase64(vault.ciphertext, 16, 256 * 1024);
const accountId = (publicKey) => `u_${crypto.createHash("sha512").update(publicKey).digest("hex").slice(0, 32)}`;
const randomUsername = async (tx) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = crypto.randomBytes(6).toString("hex");
    const existing = await tx.user.findFirst({
      where: { OR: [{ username }, { publicUsername: username }] },
      select: { id: true },
    });
    if (!existing) return username;
  }
  throw new Error("Unable to allocate a unique random username");
};
const opaqueUser = (user) => ({
  id: user.id,
  username: user.publicUsername || user.id,
  displayName: user.publicDisplayName || user.publicUsername || user.id,
  [publicIdentity]: true,
});
const onlyFields = (body, allowed) => body && typeof body === "object" &&
  !Array.isArray(body) && Object.keys(body).every((key) => allowed.includes(key));
const validDisplayName = (value) => typeof value === "string" &&
  value.trim().length > 0 && value.trim().length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const sanitizeIdentity = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeIdentity);
  if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeIdentity(item)]));
  if (typeof result.id === "string" && ("username" in result || "displayName" in result)) {
    result.username = value[publicIdentity] ? result.username : (result.publicUsername || result.id);
    result.displayName = value[publicIdentity] ? result.displayName : (result.publicDisplayName || result.username);
    result[publicIdentity] = true;
    for (const key of ["email", "phoneNumber", "bio", "profilePicture", "passwordHash", "appleId", "googleId", "authPublicKey", "authAccountId", "encryptedVault", "credentialSalt", "contactLookup", "encryptedIdentifier", "publicUsername", "publicDisplayName", "lastActiveAt", "status"]) delete result[key];
  }
  return result;
};

module.exports = { upgradeRequired, decodeBase64, validVault, validDisplayName, accountId, randomUsername, opaqueUser, onlyFields, sanitizeIdentity,
  normalizeIdentifier, userDataKey, contactLookup, syntheticSalt, credentialFields };
