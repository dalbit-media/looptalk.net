import { create } from "zustand";
import * as SecureStore from "../utils/tokenStorage";
import * as api from "../api/auth";

const TOKEN_KEY = "token";

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  loading: true,

  initialize: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        // Verify token is still valid
        const user = await api.getCurrentUser(token);
        set({ user, token, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      console.log("Initialize error:", error);
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      set({ loading: false });
    }
  },

  register: async (email, phoneNumber, password, invitationCode) => {
    try {
      const response = await api.register(
        email,
        phoneNumber,
        password,
        invitationCode
      );
      await SecureStore.setItemAsync(TOKEN_KEY, response.token);
      set({ user: response.user, token: response.token });
      return response;
    } catch (error) {
      throw error;
    }
  },

  login: async (identifier, password) => {
    try {
      const response = await api.login(identifier, password);
      await SecureStore.setItemAsync(TOKEN_KEY, response.token);
      set({ user: response.user, token: response.token });
      return response;
    } catch (error) {
      throw error;
    }
  },

  socialAuth: async (provider, idToken, invitationCode, displayName) => {
    const response = await api.socialAuth(
      provider,
      idToken,
      invitationCode,
      displayName
    );
    await SecureStore.setItemAsync(TOKEN_KEY, response.token);
    set({ user: response.user, token: response.token });
    return response;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ user: null, token: null });
  },

  updateUser: (user) => {
    set({ user });
  },
}));
