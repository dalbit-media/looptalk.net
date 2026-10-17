import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";

const RECOVERY_PREFIX = "loop2.";
const concat = (left, right) => {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
};
const canonicalBase64 = (value, length) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("Invalid encrypted account encoding");
  }
  const bytes = decodeBase64(value);
  if (encodeBase64(bytes) !== value || (length !== undefined && bytes.length !== length)) {
    throw new Error("Invalid encrypted account encoding");
  }
  return bytes;
};
const rootSecret = (recoveryKey) => {
  if (typeof recoveryKey !== "string" || !/^loop2\.[A-Za-z0-9_-]{43}$/.test(recoveryKey.trim())) {
    throw new Error("Invalid recovery key");
  }
  return canonicalBase64(`${recoveryKey.trim().slice(RECOVERY_PREFIX.length)
    .replace(/-/g, "+").replace(/_/g, "/")}=`, 32);
};
const derive = (root, purpose) => nacl.hash(concat(
  decodeUTF8(`looptalk-owner-v1:${purpose}\0`), root
)).slice(0, 32);
const accountIdFor = (publicKey) => `u_${Array.from(
  nacl.hash(publicKey).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")
).join("")}`;

export const identityFromRecoveryKey = (recoveryKey) => {
  const root = rootSecret(recoveryKey);
  const seed = derive(root, "authentication");
  try {
    const pair = nacl.sign.keyPair.fromSeed(seed);
    const result = {
      accountId: accountIdFor(pair.publicKey),
      publicKey: encodeBase64(pair.publicKey),
      recoveryKey: recoveryKey.trim(),
    };
    pair.secretKey.fill(0);
    return result;
  } finally {
    root.fill(0);
    seed.fill(0);
  }
};

export const generateAccountIdentity = (randomBytes) => {
  const root = randomBytes(32);
  try {
    const recoveryKey = RECOVERY_PREFIX + encodeBase64(root)
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return identityFromRecoveryKey(recoveryKey);
  } finally {
    root.fill(0);
  }
};

export const signAccountChallenge = (recoveryKey, challenge) => {
  const bytes = canonicalBase64(challenge);
  if (bytes.length < 32 || bytes.length > 4096) throw new Error("Invalid account challenge");
  const root = rootSecret(recoveryKey);
  const seed = derive(root, "authentication");
  const pair = nacl.sign.keyPair.fromSeed(seed);
  try {
    return encodeBase64(nacl.sign.detached(bytes, pair.secretKey));
  } finally {
    root.fill(0);
    seed.fill(0);
    pair.secretKey.fill(0);
  }
};

const ownerKey = (identity, context) => {
  const root = rootSecret(identity.recoveryKey);
  try {
    if (identityFromRecoveryKey(identity.recoveryKey).accountId !== identity.accountId) {
      throw new Error("Private account identity mismatch");
    }
    return derive(root, context === "vault" ? "vault-encryption" : "local-encryption");
  } finally {
    root.fill(0);
  }
};

export const encryptOwnerValue = (identity, context, value, randomBytes) => {
  const key = ownerKey(identity, context);
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  const plaintext = decodeUTF8(JSON.stringify({
    version: 1, accountId: identity.accountId, context, value,
  }));
  try {
    return {
      version: 1, nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(nacl.secretbox(plaintext, nonce, key)),
    };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
};

export const decryptOwnerValue = (identity, context, envelope) => {
  if (!envelope || envelope.version !== 1) throw new Error("Unsupported private data format");
  const nonce = canonicalBase64(envelope.nonce, nacl.secretbox.nonceLength);
  const ciphertext = canonicalBase64(envelope.ciphertext);
  if (ciphertext.length < nacl.secretbox.overheadLength) throw new Error("Invalid private ciphertext");
  const key = ownerKey(identity, context);
  let plaintext;
  try {
    plaintext = nacl.secretbox.open(ciphertext, nonce, key);
    if (!plaintext) throw new Error("Unable to authenticate private data");
    const decoded = JSON.parse(encodeUTF8(plaintext));
    if (decoded.version !== 1 || decoded.accountId !== identity.accountId || decoded.context !== context) {
      throw new Error("Private data belongs to another account or record");
    }
    return decoded.value;
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
};
