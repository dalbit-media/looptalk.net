import { getRandomBytes } from "expo-crypto";
import { api } from "../api/client";
import { encryptOwnerValue, decryptOwnerValue, identityFromRecoveryKey } from "./accountEncryption";
import {
  getOwnerSession, setOwnerSession, clearOwnerSession, requireOwnerSession,
  getOwnerGeneration, assertOwnerGeneration,
} from "./ownerSession";
import { readOwnerIdentity, saveOwnerIdentity, removeOwnerIdentity } from "../storage/ownerIdentityStorage";
import { clearPrivateMediaUrls, migratePrivateMedia } from "./privateMedia";
import { migrateOwnerRecords } from "../storage/privateRecords";
import { migrateDeviceIdentity } from "../storage/deviceIdentity";

let data = null;
let revision = 0;
let writes = Promise.resolve();
const validateData = (value) => {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      !value.profile || typeof value.profile !== "object" ||
      Array.isArray(value.profile) || !Array.isArray(value.contacts) ||
      !Array.isArray(value.invitations) || !value.preferences || typeof value.preferences !== "object") {
    throw new Error("Invalid private account vault");
  }
  return value;
};
export const getOwnerIdentity = () => getOwnerSession()?.identity || null;
export const getRecoveryKey = () => getOwnerIdentity()?.recoveryKey || null;
export const getSavedOwnerIdentity = async () => {
  const value = await readOwnerIdentity();
  return value ? identityFromRecoveryKey(value) : null;
};
export const createOwnerVault = async (identity, profile, imported = {}) => {
  const initial = validateData({
    version: 1, revision: 1, profile: { ...profile },
    contacts: imported.contacts || [], invitations: imported.invitations || [],
    preferences: imported.preferences || {}, conversationNames: imported.conversationNames || {},
  });
  return { data: initial, vault: encryptOwnerValue(identity, "vault", initial, getRandomBytes) };
};
export const unlockOwnerVault = async (identity, vault, serverRevision) => {
  const opened = validateData(decryptOwnerValue(identity, "vault", vault));
  if (!Number.isSafeInteger(serverRevision) || opened.revision !== serverRevision) {
    throw new Error("Invalid private account revision");
  }
  setOwnerSession({ identity, token: null });
  data = opened;
  revision = serverRevision;
  return opened;
};
export const setVaultSession = async ({ identity, token, vault, revision: serverRevision }) => {
  const opened = validateData(decryptOwnerValue(identity, "vault", vault));
  if (!Number.isSafeInteger(serverRevision) || opened.revision !== serverRevision || !token) {
    throw new Error("Invalid private account session");
  }
  await saveOwnerIdentity(identity.recoveryKey);
  clearPrivateMediaUrls(identity.userId || identity.accountId);
  setOwnerSession({ identity, token });
  data = opened;
  revision = serverRevision;
  writes = Promise.resolve();
  if (identity.userId && identity.userId !== identity.accountId) {
    const entries = await migrateOwnerRecords(identity.userId);
    await migrateDeviceIdentity(identity.userId);
    await migratePrivateMedia(identity.userId, entries);
  }
  return opened;
};
export const lockOwnerVault = async ({ forgetIdentity = true } = {}) => {
  const identity = getOwnerIdentity();
  const accountId = identity?.userId || identity?.accountId;
  clearOwnerSession();
  data = null;
  revision = 0;
  writes = Promise.resolve();
  if (accountId) clearPrivateMediaUrls(accountId);
  if (forgetIdentity) await removeOwnerIdentity();
};

export const updateVaultSessionToken = (token) => {
  if (!token) throw new Error("Invalid private account session token");
  requireOwnerSession().token = token;
};
export const getOwnerProfile = (user) => {
  if (!user) return null;
  requireOwnerSession(user.id);
  if (!data) throw new Error("Private account is locked");
  return { ...user, ...data.profile, id: user.id, username: user.username };
};
export const readOwnerVault = () => {
  requireOwnerSession();
  if (!data) throw new Error("Private account is locked");
  return JSON.parse(JSON.stringify(data));
};
export const updateOwnerVault = (update) => {
  const generation = getOwnerGeneration();
  const next = writes.catch(() => {}).then(async () => {
    assertOwnerGeneration(generation);
    const session = requireOwnerSession();
    if (!session.token) throw new Error("Private account session is not authenticated");
    const updated = validateData({ ...update(readOwnerVault()), revision: revision + 1 });
    const vault = encryptOwnerValue(session.identity, "vault", updated, getRandomBytes);
    let response;
    try {
      response = await api.put("/users/vault", { vault, expectedRevision: revision }, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch (error) {
      if (error.response?.status === 409) {
        const latest = await api.get("/users/vault", {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        assertOwnerGeneration(generation);
        const opened = validateData(decryptOwnerValue(session.identity, "vault", latest.data.vault));
        if (!Number.isSafeInteger(latest.data.revision) || latest.data.revision < revision ||
            opened.revision !== latest.data.revision) {
          throw new Error("Private vault revision moved backwards");
        }
        data = opened;
        revision = latest.data.revision;
        throw new Error("Your private data changed on another device. Please retry your change.");
      }
      throw error;
    }
    assertOwnerGeneration(generation);
    if (response.data.revision !== revision + 1) throw new Error("Invalid vault update revision");
    data = updated;
    revision = response.data.revision;
    return readOwnerVault();
  });
  writes = next;
  return next;
};
export const updateOwnerProfile = async (patch) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid private profile");
  const allowed = ["displayName", "bio", "profilePicture", "email", "phoneNumber"];
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key) || (value !== null && typeof value !== "string")) {
      throw new Error("Invalid private profile field");
    }
    if (value?.length > (key === "profilePicture" ? 600000 : key === "bio" ? 500 : 254)) {
      throw new Error("Private profile field is too long");
    }
    if (key === "profilePicture" && value &&
        !/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
      throw new Error("Private profile pictures must be embedded image data");
    }
  }
  const updated = await updateOwnerVault((current) => ({
    ...current, profile: { ...current.profile, ...patch },
  }));
  return updated.profile;
};
