import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { encodeBase64, decodeBase64, decodeUTF8 } from "tweetnacl-util";
import { identityFromRecoveryKey } from "./accountEncryption";

export const CREDENTIAL_ITERATIONS = 600000;

export const normalizeIdentifier = (value) => {
  if (typeof value !== "string" || value.length > 254) throw new Error("Invalid email or phone number");
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email or phone number");
    return email;
  }
  const phone = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) throw new Error("Invalid email or phone number");
  return phone;
};

export const createCredentialIdentity = async (identifier, password, salt) => {
  const normalized = normalizeIdentifier(identifier);
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Password must be 8 to 128 characters");
  }
  if (typeof salt !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(salt)) {
    throw new Error("Invalid account encryption parameters");
  }
  const saltBytes = decodeBase64(salt);
  if (saltBytes.length !== 16 || encodeBase64(saltBytes) !== salt) {
    throw new Error("Invalid account encryption parameters");
  }
  const passwordBytes = decodeUTF8(password);
  const context = decodeUTF8(`looptalk-credentials-v1\0${normalized}\0`);
  const derivationSalt = new Uint8Array(context.length + saltBytes.length);
  derivationSalt.set(context);
  derivationSalt.set(saltBytes, context.length);
  let root;
  try {
    root = await pbkdf2Async(sha256, passwordBytes, derivationSalt, {
      c: CREDENTIAL_ITERATIONS, dkLen: 32, asyncTick: 10,
    });
    const encoded = encodeBase64(root).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return identityFromRecoveryKey(`loop2.${encoded}`);
  } finally {
    root?.fill(0);
    passwordBytes.fill(0);
    derivationSalt.fill(0);
  }
};
