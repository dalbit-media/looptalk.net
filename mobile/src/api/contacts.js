import { api } from "./client";
import { readOwnerVault, updateOwnerVault } from "../utils/ownerVault";
import { getOwnerGeneration, assertOwnerGeneration, requireOwnerSession } from "../utils/ownerSession";
import { resolveContactDisplayName } from "../utils/contactDisplayName";

const validateContact = ({ groupName, nickname, isFavorite }) => {
  if ((groupName !== undefined && !/^(Family|All Contacts|Work|Project|School|Class) [12]$/.test(groupName)) ||
      (nickname !== undefined && nickname !== null && (typeof nickname !== "string" || nickname.length > 50)) ||
      (isFavorite !== undefined && typeof isFavorite !== "boolean")) {
    throw new Error("Invalid private contact data");
  }
};

export const getContacts = async (token) => {
  const generation = getOwnerGeneration();
  const contacts = readOwnerVault().contacts;
  const profiles = new Map();
  for (let offset = 0; offset < contacts.length; offset += 200) {
    const response = await api.post("/users/profiles", {
      userIds: contacts.slice(offset, offset + 200).map((contact) => contact.contactUserId),
    }, { headers: { Authorization: `Bearer ${token}` } });
    assertOwnerGeneration(generation);
    for (const profile of response.data) profiles.set(profile.id, profile);
  }
  const grouped = {};
  for (const contact of contacts) {
    const profile = profiles.get(contact.contactUserId);
    const displayName = resolveContactDisplayName({ ...contact, nickname: null }, profile);
    (grouped[contact.groupName] ||= []).push({
      ...contact,
      contactUser: { ...contact.contactUser, ...profile, displayName },
    });
  }
  return grouped;
};

export const getContact = async (contactUserId) => {
  const contact = readOwnerVault().contacts.find((item) => item.contactUserId === contactUserId);
  if (!contact) throw new Error("Contact not found in your private vault");
  return contact;
};

export const addContact = async (contactUserId, groupName, nickname, token, displayName) => {
  validateContact({ groupName, nickname });
  if (displayName !== undefined &&
      (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 100)) {
    throw new Error("Invalid contact display name");
  }
  const generation = getOwnerGeneration();
  if (contactUserId === requireOwnerSession().identity.accountId) throw new Error("Cannot add yourself as a contact");
  const response = await api.get(`/users/${encodeURIComponent(contactUserId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertOwnerGeneration(generation);
  const contact = {
    id: contactUserId, contactUserId,
    contactUser: {
      ...response.data,
      ...(displayName === undefined ? {} : { displayName: displayName.trim() }),
    },
    groupName, nickname: nickname?.trim() || null, isFavorite: false,
    createdAt: new Date().toISOString(),
  };
  await updateOwnerVault((current) => {
    if (current.contacts.some((item) => item.contactUserId === contactUserId)) {
      throw new Error("Already a contact");
    }
    return { ...current, contacts: [...current.contacts, contact] };
  });
  return contact;
};

export const updateContact = async (contactUserId, updates, token) => {
  validateContact(updates);
  if (Object.keys(updates).some((key) => !["groupName", "nickname", "isFavorite"].includes(key))) {
    throw new Error("Invalid private contact field");
  }
  await updateOwnerVault((current) => {
    if (!current.contacts.some((item) => item.contactUserId === contactUserId)) {
      throw new Error("Contact not found in your private vault");
    }
    return {
      ...current, contacts: current.contacts.map((contact) => contact.contactUserId === contactUserId
        ? { ...contact, ...updates, id: contact.id, contactUserId, contactUser: contact.contactUser }
        : contact),
    };
  });
  return { success: true };
};

export const deleteContact = async (contactUserId, token) => {
  await updateOwnerVault((current) => ({
    ...current, contacts: current.contacts.filter((contact) => contact.contactUserId !== contactUserId),
  }));
  return { success: true };
};
