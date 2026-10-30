import { create } from "zustand";
import * as SecureStore from "../utils/tokenStorage";
import * as api from "../api/auth";
import { publishDisplayName } from "../api/users";
import { initializeInvitationContact } from "../utils/invitationOnboarding";
import { normalizeInvitationCode } from "../utils/invitationCode";
import { getOwnerGeneration, assertOwnerGeneration } from "../utils/ownerSession";
import {
  createAccountIdentity,
  createCredentialIdentity,
  createCredentialSalt,
  generateUsername,
  normalizeIdentifier,
  signAccountChallenge,
} from "../utils/accountPrivacy";
import {
  createOwnerVault,
  lockOwnerVault,
  setVaultSession,
  getSavedOwnerIdentity,
  getOwnerProfile,
  updateVaultSessionToken,
} from "../utils/ownerVault";

const TOKEN_KEY = "token";
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
let renewal;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_AUTH_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 10000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limits and gateway blips are temporary, so wait (honoring Retry-After) instead of failing startup.
const retryDelay = (error, attempt) => {
  const seconds = Number(error.response?.headers?.["retry-after"]);
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * 2 ** attempt;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

const authenticateSavedIdentity = async (identity, { retry = false } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { challengeId, challenge } = await api.getChallenge(identity.accountId);
      const signature = signAccountChallenge(identity.recoveryKey, challenge);
      return await api.login(identity.accountId, challengeId, signature);
    } catch (error) {
      if (!retry || attempt + 1 >= MAX_AUTH_ATTEMPTS || !RETRYABLE_STATUSES.has(error.response?.status)) throw error;
      await wait(retryDelay(error, attempt));
    }
  }
};

const clearRuntime = () => {
  // Resolve lazily because messaging and calling also consume the auth store.
  const { useMessageStore } = require("./messageStore");
  const { useContactStore } = require("./contactStore");
  const { useCallStore } = require("./callStore");
  const { useAlertStore } = require("./alertStore");
  const { usePreferencesStore } = require("./preferencesStore");
  try { useCallStore.getState().endCall(); } catch { console.warn("Unable to clear active call"); }
  try { useMessageStore.getState().cleanup(); } catch { console.warn("Unable to clear messaging runtime"); }
  useMessageStore.setState({
    conversations: [], messages: [], currentConversation: null,
    activeUserId: null, loading: false, typingUsers: new Set(),
    onlineUsers: new Set(), presenceByUser: {},
  });
  useContactStore.setState({ contacts: {}, loading: false });
  useAlertStore.setState({ request: null });
  usePreferencesStore.getState().resetOwnerPreferences();
};

const clearSession = async () => {
  clearRuntime();
  await Promise.all([
    lockOwnerVault(),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
};

const clearFailedSession = async () => {
  try { await clearSession(); } catch { console.warn("Unable to clear private account session"); }
};

const validateCredentials = (identifier, password) => {
  const normalized = normalizeIdentifier(identifier);
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Invalid credentials");
  }
  return normalized;
};

const openSession = async (identity, response) => {
  if (!response.user?.id || !response.token || !response.vault ||
      (response.accountId && response.accountId !== identity.accountId)) {
    throw new Error("Invalid private account response");
  }
  await setVaultSession({
    identity: { ...identity, userId: response.user.id },
    token: response.token,
    vault: response.vault,
    revision: response.revision,
  });
  const profile = getOwnerProfile(response.user);
  if (profile.displayName && profile.displayName !== response.user.displayName) {
    await publishDisplayName(profile.displayName, response.token);
  }
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  const { usePreferencesStore } = require("./preferencesStore");
  usePreferencesStore.getState().loadOwnerPreferences();
  const welcomeConversationId = await initializeInvitationContact(response.token, response.user.id);
  return { user: getOwnerProfile(response.user), welcomeConversationId, sessionRenewedAt: Date.now() };
};

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  loading: true,
  initializationError: false,
  sessionRenewedAt: 0,
  pendingRegistration: null,
  pendingMigration: null,
  welcomeConversationId: null,
  clearWelcomeConversation: () => set({ welcomeConversationId: null }),

  initialize: async () => {
    set({ loading: true, initializationError: false });
    try {
      const identity = await getSavedOwnerIdentity();
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!identity || !token) {
        await clearSession();
        set({ user: null, token: null, loading: false });
        return;
      }
      const response = await authenticateSavedIdentity(identity, { retry: true });
      const opened = await openSession(identity, response);
      set({ ...opened, token: response.token, loading: false, initializationError: false });
    } catch (error) {
      console.warn("Unable to initialize private account session:", error.message);
      if (error.response?.status === 401 || error.response?.status === 403) {
        await clearFailedSession();
        set({ user: null, token: null, loading: false, initializationError: true });
        return;
      }
      clearRuntime();
      await lockOwnerVault({ forgetIdentity: false });
      set({ user: null, token: null, loading: false, initializationError: true });
      throw error;
    }
  },

  renewSession: async () => {
    if (!get().token || Date.now() - get().sessionRenewedAt < RENEW_AFTER_MS) return;
    if (renewal) return renewal;
    const generation = getOwnerGeneration();
    const userId = get().user.id;
    renewal = (async () => {
      const identity = await getSavedOwnerIdentity();
      assertOwnerGeneration(generation);
      if (!identity) throw new Error("Saved account identity is missing");
      const response = await authenticateSavedIdentity(identity);
      assertOwnerGeneration(generation);
      if (response.user?.id !== userId || response.accountId !== identity.accountId || !response.token) {
        throw new Error("Invalid renewed account identity");
      }
      const { useCallStore } = require("./callStore");
      if (useCallStore.getState().call) return;
      await SecureStore.setItemAsync(TOKEN_KEY, response.token);
      assertOwnerGeneration(generation);
      updateVaultSessionToken(response.token);
      set({ token: response.token, sessionRenewedAt: Date.now() });
    })().catch(async (error) => {
      if (getOwnerGeneration() === generation &&
          (error.response?.status === 401 || error.response?.status === 403)) {
        await get().logout();
        set({ initializationError: true });
      }
      throw error;
    }).finally(() => { renewal = null; });
    return renewal;
  },

  register: async (identifier, password, displayName, invitationCode) => {
    const normalized = validateCredentials(identifier, password);
    const name = (displayName || "").trim();
    if (name.length > 100) throw new Error("Invalid display name");
    set({ user: null, token: null, pendingRegistration: null, welcomeConversationId: null });
    await clearSession();
    try {
      const credentialSalt = createCredentialSalt();
      const identity = await createCredentialIdentity(normalized, password, credentialSalt);
      const { vault } = await createOwnerVault(identity, { displayName: name });
      const response = await api.register(normalized, credentialSalt, identity.publicKey, vault, invitationCode || undefined, name || undefined);
      const opened = await openSession(identity, response);
      set({
        ...opened, token: response.token, initializationError: false,
      });
      return response;
    } catch (error) {
      await clearFailedSession();
      throw error;
    }
  },

  joinNetwork: async (invitationCode) => {
    const { token, user } = get();
    if (!token || !user) throw new Error("Sign in before joining a network");
    const generation = getOwnerGeneration();
    const response = await api.joinNetwork(normalizeInvitationCode(invitationCode), token);
    assertOwnerGeneration(generation);
    if (response.user?.id !== user.id || response.user.member !== true) {
      throw new Error("Invalid network join response");
    }
    set({ user: { ...get().user, member: true } });
    // The server already accepted the invitation; a failed contact import is retried on the next sign-in.
    try {
      const welcomeConversationId = await initializeInvitationContact(token, user.id);
      assertOwnerGeneration(generation);
      set({ welcomeConversationId });
    } catch (error) {
      console.warn("Unable to import the inviter contact:", error.message);
    }
    return response;
  },

  login: async (identifier, password) => {
    try {
      set({ user: null, token: null, pendingRegistration: null, welcomeConversationId: null });
      await clearSession();
      const normalized = validateCredentials(identifier, password);
      const parameters = await api.getCredentialParameters(normalized);
      if (parameters.version !== 1 || parameters.iterations !== 600000 || !parameters.salt) {
        throw new Error("Unsupported credential parameters");
      }
      const identity = await createCredentialIdentity(normalized, password, parameters.salt);
      const { challengeId, challenge } = await api.getChallenge(identity.accountId);
      const signature = signAccountChallenge(identity.recoveryKey, challenge);
      const response = await api.login(identity.accountId, challengeId, signature);
      const opened = await openSession(identity, response);
      set({
        ...opened, token: response.token,
        pendingRegistration: null, initializationError: false,
      });
      return response;
    } catch (error) {
      await clearFailedSession();
      throw error;
    }
  },

  prepareLegacyMigration: async (identifier, password, skipPhoto = false) => {
    const { createLegacySnapshot } = require("../screens/auth/legacyMigration");
    const snapshotPreferences = require("./preferencesStore").usePreferencesStore.getState();
    set({ user: null, token: null, pendingRegistration: null, pendingMigration: null, welcomeConversationId: null });
    await clearSession();
    const normalized = validateCredentials(identifier, password);
    const legacy = await api.legacyLogin(normalized, password);
    if (!legacy.token || !legacy.user?.id || legacy.migrationRequired !== true) {
      throw new Error("Legacy migration authorization is required");
    }
    const snapshot = await createLegacySnapshot(
      await api.getLegacyData(legacy.token), snapshotPreferences, legacy.token, skipPhoto
    );
    const credentialSalt = createCredentialSalt();
    const identity = await createCredentialIdentity(normalized, password, credentialSalt);
    const { vault } = await createOwnerVault(identity, snapshot.profile, snapshot);
    set({ pendingMigration: { identity, vault, identifier: normalized, credentialSalt, legacyToken: legacy.token, userId: legacy.user.id } });
    return { contactCount: snapshot.contacts.length };
  },

  cancelLegacyMigration: async () => {
    set({ pendingMigration: null });
    await clearSession();
  },

  completeLegacyMigration: async () => {
    const pending = get().pendingMigration;
    if (!pending) throw new Error("No prepared legacy migration");
    const response = await api.migrateLegacyAccount(
      pending.identity.publicKey, pending.vault, pending.legacyToken,
      pending.identifier, pending.credentialSalt
    );
    if (response.user?.id !== pending.userId ||
        response.accountId !== pending.identity.accountId) {
      throw new Error("Invalid migrated account identity");
    }
    const opened = await openSession(pending.identity, response);
    set({
      ...opened, token: response.token, pendingMigration: null,
      pendingRegistration: null, initializationError: false,
    });
  },

  // Apple/Google identities are only linked for account recovery; they never replace the device key.
  socialRegister: async ({ provider, idToken, displayName, invitationCode }) => {
    const name = (displayName || "").trim();
    if (name.length > 100) throw new Error("Invalid display name");
    set({ user: null, token: null, pendingRegistration: null, welcomeConversationId: null });
    await clearSession();
    try {
      const identity = await createAccountIdentity();
      const { vault } = await createOwnerVault(identity, { displayName: name });
      let response;
      for (let attempt = 0; !response; attempt += 1) {
        try {
          response = await api.register(
            generateUsername(), createCredentialSalt(), identity.publicKey, vault,
            invitationCode || undefined, name || undefined, { provider, idToken }
          );
        } catch (error) {
          const retryable = error.response?.status === 409 && error.response.data?.code !== "SOCIAL_ACCOUNT_EXISTS";
          if (!retryable || attempt + 1 >= 3) throw error;
        }
      }
      const opened = await openSession(identity, response);
      set({ ...opened, token: response.token, initializationError: false });
      return response;
    } catch (error) {
      await clearFailedSession();
      throw error;
    }
  },

  // Replaces the lost device key; the old encrypted vault (chat history) cannot be restored.
  socialRecover: async ({ provider, idToken }) => {
    set({ user: null, token: null, pendingRegistration: null, welcomeConversationId: null });
    await clearSession();
    try {
      const identity = await createAccountIdentity();
      const { vault } = await createOwnerVault(identity, { displayName: "" });
      const response = await api.socialRecover(provider, idToken, identity.publicKey, vault);
      const opened = await openSession(identity, response);
      set({ ...opened, token: response.token, initializationError: false });
      return response;
    } catch (error) {
      await clearFailedSession();
      throw error;
    }
  },

  logout: async () => {
    set({ user: null, token: null, pendingRegistration: null, pendingMigration: null, welcomeConversationId: null });
    await clearSession();
  },

  updateUser: (user) => set({ user: getOwnerProfile(user) }),
}));
