import { api } from "./client";
import { createCipherUpload } from "../utils/privateMedia";

const headers = (token) => ({ Authorization: `Bearer ${token}` });

export const registerDevice = async (identity, token) => {
  const response = await api.post("/secure/devices", {
    deviceId: identity.deviceId, publicKey: identity.publicKey,
  }, { headers: headers(token) });
  return response.data;
};
export const getRecipientDevices = async (conversationId, token) => {
  const response = await api.get(`/secure/conversations/${conversationId}/devices`, { headers: headers(token) });
  return response.data;
};
export const sendEncryptedDelivery = async (conversationId, metadata, bytes, token, options = {}) => {
  const upload = await createCipherUpload(bytes, metadata.id);
  try {
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    if (typeof Blob !== "undefined" && upload.file instanceof Blob) {
      form.append("payload", upload.file, "encrypted.bin");
    } else {
      form.append("payload", upload.file);
    }
    const response = await api.post(`/secure/conversations/${conversationId}/messages`, form, {
      headers: headers(token), timeout: 180000, ...options,
    });
    return response.data;
  } finally {
    upload.dispose();
  }
};
export const getEncryptedInbox = async (deviceId, token) => {
  const response = await api.get("/secure/inbox", {
    headers: headers(token), params: { deviceId },
  });
  return response.data;
};
export const getEncryptedPayload = async (id, deviceId, token) => {
  const response = await api.get(`/secure/messages/${id}/payload`, {
    headers: headers(token), params: { deviceId }, responseType: "arraybuffer", timeout: 180000,
  });
  return new Uint8Array(response.data);
};
export const acknowledgeDelivery = async (id, deviceId, token) => {
  await api.post(`/secure/messages/${id}/ack`, { deviceId }, { headers: headers(token) });
};
