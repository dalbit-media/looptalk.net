import { create } from "zustand";

export const useAlertStore = create((set) => ({
  request: null,
  show: (title, message, buttons) => set({ request: { title, message, buttons } }),
  hide: () => set({ request: null }),
}));