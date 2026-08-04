import { api } from "./client";

export const getContacts = async (token) => {
  const response = await api.get("/contacts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getContact = async (contactUserId, token) => {
  const response = await api.get(`/contacts/${contactUserId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const addContact = async (contactUserId, groupName, nickname, token) => {
  const response = await api.post(
    "/contacts",
    { contactUserId, groupName, nickname },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const updateContact = async (contactUserId, updates, token) => {
  const response = await api.put(`/contacts/${contactUserId}`, updates, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const deleteContact = async (contactUserId, token) => {
  const response = await api.delete(`/contacts/${contactUserId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
