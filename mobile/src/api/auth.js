import { api } from "./client";

export const getBootstrapStatus = async () => {
  const response = await api.get("/auth/bootstrap-status");
  return response.data;
};

export const register = async (
  email,
  phoneNumber,
  password,
  invitationCode
) => {
  const response = await api.post("/auth/register", {
    email,
    phoneNumber,
    password,
    invitationCode,
  });
  return response.data;
};

export const login = async (identifier, password) => {
  const response = await api.post("/auth/login", {
    identifier,
    password,
  });
  return response.data;
};

export const socialAuth = async (
  provider,
  idToken,
  invitationCode,
  displayName
) => {
  const response = await api.post("/auth/social", {
    provider,
    idToken,
    invitationCode,
    displayName,
  });
  return response.data;
};

export const getCurrentUser = async (token) => {
  const response = await api.get("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
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
