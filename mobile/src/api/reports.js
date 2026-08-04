import { api } from "./client";

export const submitReport = async ({ reportedUserId, messageId, category, details }, token) => {
  const response = await api.post(
    "/reports",
    { reportedUserId, messageId, category, details },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};
