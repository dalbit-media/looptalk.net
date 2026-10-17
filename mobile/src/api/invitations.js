import { api } from "./client";
import { readOwnerVault, updateOwnerVault, getOwnerIdentity } from "../utils/ownerVault";
import { normalizeInvitationCode } from "../utils/invitationCode";
import { ensureSecureDevice } from "../utils/secureMessaging";

const invitationStats = (invitations) => {
  const used = invitations.filter((item) => item.status === "USED");
  return {
    linksShared: invitations.length, acceptedUsers: used.length,
    connections: readOwnerVault().contacts.length,
    recentConnections: used.filter((item) =>
      Date.parse(item.createdAt) >= Date.now() - 30 * 24 * 60 * 60 * 1000
    ).length,
  };
};

export const createInvitation = async (token, language) => {
  const displayName = readOwnerVault().profile.displayName;
  const identity = getOwnerIdentity();
  await ensureSecureDevice(identity.userId || identity.accountId, token);
  const response = await api.post(
    "/invitations/create",
    { language, ...(displayName?.trim() ? { inviterDisplayName: displayName.trim() } : {}) },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const result = response.data;
  if (!result || typeof result.code !== "string" || !result.invitationUrl || !result.expiresAt) {
    throw new Error("Invalid invitation response");
  }
  const invitation = {
    id: result.code, code: result.code, status: "CREATED",
    invitationUrl: result.invitationUrl, expiresAt: result.expiresAt,
    createdAt: result.createdAt || new Date().toISOString(),
  };
  const updated = await updateOwnerVault((current) => ({
    ...current, invitations: [...current.invitations, invitation],
  }));
  return { ...invitation, stats: invitationStats(updated.invitations) };
};

export const getInvitationStats = async () => invitationStats(readOwnerVault().invitations);

export const getInvitationInfo = async (code) => {
  const response = await api.get(`/invitations/${encodeURIComponent(normalizeInvitationCode(code))}`);
  return response.data;
};

export const listInvitations = async () => {
  const invitations = readOwnerVault().invitations;
  const updates = new Map();
  for (let start = 0; start < invitations.length; start += 6) {
    await Promise.all(invitations.slice(start, start + 6).map(async (invitation) => {
      if (invitation.status !== "CREATED") return;
      if (Date.parse(invitation.expiresAt) <= Date.now()) {
        updates.set(invitation.code, "EXPIRED");
        return;
      }
      const info = await getInvitationInfo(invitation.code);
      if (info.status === "ACCEPTED" || info.status === "USED") updates.set(invitation.code, "USED");
      else if (info.status === "EXPIRED") updates.set(invitation.code, "EXPIRED");
    }));
  }
  if (!updates.size) return invitations;
  const updated = await updateOwnerVault((current) => ({
    ...current, invitations: current.invitations.map((invitation) => ({
      ...invitation, status: updates.get(invitation.code) || invitation.status,
    })),
  }));
  return updated.invitations;
};
