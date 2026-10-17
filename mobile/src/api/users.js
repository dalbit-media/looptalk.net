import { api } from "./client";
import { File } from "expo-file-system";
import { getOwnerIdentity, getOwnerProfile, updateOwnerProfile } from "../utils/ownerVault";

const MAX_PROFILE_PICTURE_BYTES = 450000;
const MAX_PROFILE_PICTURE_CHARACTERS = 600000;
const assertPictureSize = (size, limit) => {
  if (size > limit) {
    const error = new Error("Profile picture exceeds the encrypted profile size limit");
    error.code = "PROFILE_PHOTO_TOO_LARGE";
    throw error;
  }
};

export const getOwnerVault = async (token) => {
  const response = await api.get("/users/vault", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getUser = async (userId, token) => {
  const response = await api.get(`/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const identity = getOwnerIdentity();
  return String(response.data.id) === (identity?.userId || identity?.accountId)
    ? getOwnerProfile(response.data)
    : response.data;
};

export const publishDisplayName = async (displayName, token) => {
  const response = await api.put("/users", { displayName }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data.user;
};

export const updateProfile = async (updates, token) => {
  if (!getOwnerIdentity()) throw new Error("Owner vault is locked");
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Invalid private profile");
  }
  const normalized = { ...updates };
  const { username } = normalized;
  delete normalized.username;
  if (username !== undefined && (typeof username !== "string" || !/^[A-Za-z0-9_]{3,24}$/.test(username))) {
    const error = new Error("Invalid public username");
    error.code = "USERNAME_INVALID";
    throw error;
  }
  if (typeof normalized.displayName === "string") {
    normalized.displayName = normalized.displayName.trim();
    if (!normalized.displayName || normalized.displayName.length > 100) {
      throw new Error("Invalid display name");
    }
  }
  if (typeof normalized.bio === "string") normalized.bio = normalized.bio.trim();
  if (typeof normalized.profilePicture === "string") {
    assertPictureSize(normalized.profilePicture.length, MAX_PROFILE_PICTURE_CHARACTERS);
  }
  let publicUser;
  if (username !== undefined || normalized.displayName !== undefined) {
    const response = await api.put("/users", {
      ...(username === undefined ? {} : { username }),
      ...(normalized.displayName === undefined ? {} : { displayName: normalized.displayName }),
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    publicUser = response.data.user;
  } else {
    const response = await api.get("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    publicUser = response.data;
  }
  const identity = getOwnerIdentity();
  if (!publicUser?.id || publicUser.id !== (identity?.userId || identity?.accountId) ||
      typeof publicUser.username !== "string" || !publicUser.username) {
    throw new Error("Invalid public profile response");
  }
  if (Object.keys(normalized).length) await updateOwnerProfile(normalized);
  return getOwnerProfile(publicUser);
};

export const uploadProfilePicture = async (file, token) => {
  if (!getOwnerIdentity()) throw new Error("Owner vault is locked");
  assertPictureSize(file.fileSize, MAX_PROFILE_PICTURE_BYTES);
  let profilePicture;
  if (file.uri?.startsWith("data:image/")) {
    profilePicture = file.uri;
  } else if (typeof FileReader !== "undefined") {
    let blob = file.file;
    if (!blob) {
      const response = await fetch(file.uri);
      if (!response.ok) throw new Error("Failed to read selected profile picture");
      blob = await response.blob();
    }
    assertPictureSize(blob.size, MAX_PROFILE_PICTURE_BYTES);
    profilePicture = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read selected profile picture"));
      reader.readAsDataURL(blob);
    });
  } else {
    const selected = new File(file.uri);
    assertPictureSize(selected.size, MAX_PROFILE_PICTURE_BYTES);
    const base64 = await selected.base64();
    profilePicture = `data:${file.mimeType || "image/jpeg"};base64,${base64}`;
  }
  if (typeof profilePicture !== "string" || !profilePicture.startsWith("data:image/")) {
    throw new Error("Invalid profile picture");
  }
  assertPictureSize(profilePicture.length, MAX_PROFILE_PICTURE_CHARACTERS);
  const user = await updateProfile({ profilePicture }, token);
  return { url: profilePicture, user };
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
