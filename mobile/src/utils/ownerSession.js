import { getRandomBytes } from "expo-crypto";
import { encryptOwnerValue, decryptOwnerValue } from "./accountEncryption";

let session = null;
let generation = 0;
const privateAccountIds = new Set();
export const getOwnerSession = () => session;
export const getOwnerGeneration = () => generation;
export const setOwnerSession = (value) => {
  session = value;
  privateAccountIds.add(value.identity.accountId);
  if (value.identity.userId) privateAccountIds.add(value.identity.userId);
  generation += 1;
};
export const clearOwnerSession = () => { session = null; generation += 1; };
export const requireOwnerSession = (accountId) => {
  if (!session || (accountId && session.identity.accountId !== accountId && session.identity.userId !== accountId)) {
    throw new Error("Unlock your private account before accessing its data");
  }
  return session;
};
export const isOwnerAccount = (accountId) =>
  /^u_[a-f0-9]{32}$/.test(accountId || "") || privateAccountIds.has(accountId);
export const assertOwnerGeneration = (expected) => {
  if (generation !== expected) throw new Error("Private account changed during storage operation");
};
const recordAccount = (key) => key.split(":").find(isOwnerAccount);
export const encodeStoredRecord = (key, value) => {
  const accountId = recordAccount(key);
  if (!accountId) return value;
  const { identity } = requireOwnerSession(accountId);
  return JSON.stringify(encryptOwnerValue(identity, `record:${key}`, value, getRandomBytes));
};
export const decodeStoredRecord = (key, value) => {
  const accountId = recordAccount(key);
  if (!accountId) {
    if (typeof value === "string" && value.startsWith('{"version":1,"nonce":')) {
      throw new Error("Unlock your private account before accessing its data");
    }
    return value;
  }
  const { identity } = requireOwnerSession(accountId);
  if (value === null || value === undefined) return null;
  const decrypted = decryptOwnerValue(identity, `record:${key}`, JSON.parse(value));
  if (typeof decrypted !== "string") throw new Error("Invalid private record value");
  return decrypted;
};
export const encryptLocalValue = (accountId, context, value) =>
  encryptOwnerValue(requireOwnerSession(accountId).identity, context, value, getRandomBytes);
export const decryptLocalValue = (accountId, context, envelope) =>
  decryptOwnerValue(requireOwnerSession(accountId).identity, context, envelope);
