import { api } from "./client";

export const createInvitation = async (token, language) => {
  const response = await api.post(
    "/invitations/create",
    { language },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

export const getInvitationStats = async (token) => {
  const response = await api.get("/invitations/stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getInvitationInfo = async (code) => {
  const response = await api.get(`/invitations/${code}`);
  return response.data;
};

export const listInvitations = async (token, language) => {
  const response = await api.get("/invitations", {
    headers: { Authorization: `Bearer ${token}` },
    params: { lang: language },
  });
  return response.data;
};
