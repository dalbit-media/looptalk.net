const crypto = require("node:crypto");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const { userDataKey } = require("./privateAccounts");

const PROVIDERS = {
  google: {
    column: "googleId", audiences: "GOOGLE_CLIENT_IDS", jwks: "https://www.googleapis.com/oauth2/v3/certs",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
  },
  apple: {
    column: "appleId", audiences: "APPLE_CLIENT_IDS", jwks: "https://appleid.apple.com/auth/keys",
    issuers: ["https://appleid.apple.com"],
  },
};
const KEY_TTL_MS = 60 * 60 * 1000;
const cache = new Map();
let fetchKeys = async (url) => (await axios.get(url, { timeout: 5000 })).data.keys;

const socialError = (code) => Object.assign(new Error(code), { code });

const loadKeys = async (provider, force) => {
  const cached = cache.get(provider);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.keys;
  let keys;
  try {
    keys = await fetchKeys(PROVIDERS[provider].jwks);
  } catch {
    throw socialError("SOCIAL_UNAVAILABLE");
  }
  if (!Array.isArray(keys)) throw socialError("SOCIAL_UNAVAILABLE");
  cache.set(provider, { keys, expiresAt: Date.now() + KEY_TTL_MS });
  return keys;
};

const audiencesFor = (config) => (process.env[config.audiences] || "").split(",").map((value) => value.trim()).filter(Boolean);

// Returns an opaque, keyed hash of the provider account so no provider identity is stored in clear text.
const verifySocialToken = async (provider, idToken) => {
  const config = PROVIDERS[provider];
  if (!config) throw socialError("INVALID_SOCIAL_TOKEN");
  const audience = audiencesFor(config);
  if (!audience.length) throw socialError("SOCIAL_UNAVAILABLE");
  if (typeof idToken !== "string" || idToken.length > 4096) throw socialError("INVALID_SOCIAL_TOKEN");
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (header?.alg !== "RS256" || !header.kid) throw socialError("INVALID_SOCIAL_TOKEN");
  let jwk = (await loadKeys(provider, false)).find((key) => key.kid === header.kid);
  if (!jwk) jwk = (await loadKeys(provider, true)).find((key) => key.kid === header.kid);
  if (!jwk) throw socialError("INVALID_SOCIAL_TOKEN");
  let claims;
  try {
    claims = jwt.verify(idToken, crypto.createPublicKey({ key: jwk, format: "jwk" }), {
      algorithms: ["RS256"], issuer: config.issuers, audience,
    });
  } catch {
    throw socialError("INVALID_SOCIAL_TOKEN");
  }
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 256) throw socialError("INVALID_SOCIAL_TOKEN");
  const providerId = crypto.createHmac("sha256", userDataKey())
    .update(`looptalk:social:v1\0${provider}\0${claims.sub}`).digest("hex");
  return { column: config.column, providerId };
};

module.exports = {
  verifySocialToken,
  setKeyFetcher: (fetcher) => { fetchKeys = fetcher; cache.clear(); },
};
