import { api } from "./client";

export const getUser = async (userId, token) => {
  const response = await api.get(`/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const updateProfile = async (updates, token) => {
  const response = await api.put("/users", updates, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const searchUsers = async (query, token) => {
  const response = await api.get("/users/search", {
    params: { q: query },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const blockUser = async (userId, token) => {
  const response = await api.post(`/users/${userId}/block`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const unblockUser = async (userId, token) => {
  const response = await api.post(`/users/${userId}/unblock`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
