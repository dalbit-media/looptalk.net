import { create } from "zustand";

// Backing store for the web Alert fallback (see ../utils/showAlert.js).
// react-native-web's Alert.alert() is a no-op, so on web we render a
// custom modal driven by this store instead.
export const useAlertStore = create((set) => ({
  request: null,
  show: (title, message, buttons) => set({ request: { title, message, buttons } }),
  hide: () => set({ request: null }),
}));
