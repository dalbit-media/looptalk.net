import { getInvitationOnboarding } from "../api/auth";
import { readOwnerVault, updateOwnerVault } from "./ownerVault";
import { getOwnerGeneration, assertOwnerGeneration } from "./ownerSession";

export const initializeInvitationContact = async (token, userId) => {
  if (readOwnerVault().invitationOnboardingComplete) return null;
  const generation = getOwnerGeneration();
  const onboarding = await getInvitationOnboarding(token);
  assertOwnerGeneration(generation);
  if (!onboarding) return null;
  const { inviter, inviterDisplayName, conversationId, createdAt } = onboarding;
  if (!inviter?.id || inviter.id === userId || typeof inviter.username !== "string" ||
      typeof conversationId !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      (inviterDisplayName !== null && inviterDisplayName !== undefined && typeof inviterDisplayName !== "string")) {
    throw new Error("Invalid invitation onboarding");
  }
  const contact = {
    id: inviter.id, contactUserId: inviter.id,
    contactUser: { ...inviter, displayName: inviterDisplayName || inviter.displayName || inviter.username },
    groupName: "All Contacts 1", nickname: null, isFavorite: false, createdAt,
  };
  await updateOwnerVault((current) => {
    if (current.invitationOnboardingComplete) return current;
    const existing = current.contacts.find((item) => item.contactUserId === inviter.id);
    return {
      ...current,
      contacts: [existing || contact, ...current.contacts.filter((item) => item.contactUserId !== inviter.id)],
      invitationOnboardingComplete: true,
    };
  });
  return conversationId;
};
