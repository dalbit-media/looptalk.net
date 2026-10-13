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

export const uploadProfilePicture = async (file, token) => {
  const formData = new FormData();
  const fileName = file.fileName || "profile-picture.jpg";

  if (file.file) {
    formData.append("file", file.file, fileName);
  } else if (typeof window !== "undefined") {
    const fileResponse = await fetch(file.uri);
    if (!fileResponse.ok) {
      throw new Error("Failed to read selected profile picture");
    }
    formData.append("file", await fileResponse.blob(), fileName);
  } else {
    formData.append("file", {
      uri: file.uri,
      name: fileName,
      type: file.mimeType || "image/jpeg",
    });
  }

  const response = await api.post("/media/profile-picture", formData, {
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
