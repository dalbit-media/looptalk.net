import { api } from "./client";

export const getBootstrapStatus = async () => {
  const response = await api.get("/auth/bootstrap-status");
  return response.data;
};

export const getCredentialParameters = async (identifier) => {
  const response = await api.post("/auth/credential-parameters", { identifier });
  return response.data;
};

export const register = async (identifier, credentialSalt, publicKey, vault, invitationCode, displayName, social) => {
  const response = await api.post("/auth/register", {
    identifier,
    credentialSalt,
    publicKey,
    vault,
    invitationCode,
    ...(displayName === undefined ? {} : { displayName }),
    ...(social ? { social } : {}),
  });
  return response.data;
};

export const socialRecover = async (provider, idToken, publicKey, vault) => {
  const response = await api.post("/auth/social-recover", { provider, idToken, publicKey, vault });
  return response.data;
};

export const getChallenge = async (accountId) => {
  const response = await api.post("/auth/challenge", { accountId });
  return response.data;
};

export const login = async (accountId, challengeId, signature) => {
  const response = await api.post("/auth/login", {
    accountId,
    challengeId,
    signature,
  });
  return response.data;
};

export const legacyLogin = async (identifier, password) => {
  const response = await api.post("/auth/legacy-login", { identifier, password });
  return response.data;
};

export const getLegacyData = async (token) => {
  const response = await api.get("/auth/legacy-data", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const migrateLegacyAccount = async (publicKey, vault, token, identifier, credentialSalt) => {
  const response = await api.post("/auth/migrate", {
    identifier,
    credentialSalt,
    publicKey,
    vault,
    confirmation: "ENCRYPT_AND_REMOVE_LEGACY_PROFILE",
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getCurrentUser = async (token) => {
  const response = await api.get("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getInvitationOnboarding = async (token) => {
  const response = await api.get("/auth/invitation-onboarding", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data.onboarding;
};

export const joinNetwork = async (invitationCode, token) => {
  const response = await api.post("/auth/join-network", { invitationCode }, {
    headers: { Authorization: ["Bearer", token].join(" ") },
  });
  return response.data;
};

export const getWebPushKey = async () => {
  const response = await api.get("/auth/web-push-key");
  return response.data;
};

export const registerDeviceToken = async (deviceToken, platform, authToken) => {
  const response = await api.post(
    "/auth/device-token",
    { token: deviceToken, platform },
    {
      headers: { Authorization: `Bearer ${authToken}` },
    }
  );
  return response.data;
};

export const disableDeviceTokens = async (authToken) => {
  const response = await api.delete("/auth/device-token", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return response.data;
};

export const deleteAccount = async (authToken) => {
  const response = await api.delete("/auth/account", {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { confirmation: "DELETE" },
  });
  return response.data;
};
