import { create } from "zustand";
import * as api from "../api/contacts";
import { getOwnerGeneration, assertOwnerGeneration } from "../utils/ownerSession";

export const useContactStore = create((set, get) => ({
  contacts: {},
  loading: false,

  loadContacts: async (token) => {
    const generation = getOwnerGeneration();
    set({ loading: true });
    try {
      const contacts = await api.getContacts(token);
      assertOwnerGeneration(generation);
      set({ contacts, loading: false });
    } catch (error) {
      console.error("Error loading contacts:", error);
      if (generation === getOwnerGeneration()) set({ loading: false });
    }
  },

  addContact: async (contactUserId, groupName, nickname, token, displayName) => {
    try {
      const contact = await api.addContact(
        contactUserId,
        groupName,
        nickname,
        token,
        displayName
      );
      const { contacts } = get();
      set({
        contacts: {
          ...contacts,
          [groupName]: [...(contacts[groupName] || []), contact],
        },
      });
    } catch (error) {
      console.error("Error adding contact:", error);
      throw error;
    }
  },

  updateContact: async (contactUserId, updates, token) => {
    try {
      await api.updateContact(contactUserId, updates, token);
      // Reload contacts
      const contacts = await api.getContacts(token);
      set({ contacts });
    } catch (error) {
      console.error("Error updating contact:", error);
      throw error;
    }
  },

  deleteContact: async (contactUserId, token) => {
    try {
      await api.deleteContact(contactUserId, token);
      // Reload contacts
      const contacts = await api.getContacts(token);
      set({ contacts });
    } catch (error) {
      console.error("Error deleting contact:", error);
      throw error;
    }
  },

  toggleFavorite: async (contactUserId, isFavorite, token) => {
    const { contacts } = get();
    const previousContacts = contacts;
    // Optimistic update so the star responds instantly
    const nextContacts = {};
    Object.entries(contacts).forEach(([groupName, contactList]) => {
      nextContacts[groupName] = contactList.map((contact) =>
        contact.contactUser.id === contactUserId
          ? { ...contact, isFavorite }
          : contact
      );
    });
    set({ contacts: nextContacts });

    try {
      await api.updateContact(contactUserId, { isFavorite }, token);
    } catch (error) {
      console.error("Error toggling favorite:", error);
      set({ contacts: previousContacts });
      throw error;
    }
  },
}));
