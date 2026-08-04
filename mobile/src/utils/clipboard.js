import { setStringAsync } from "expo-clipboard";

export const copyText = async (text) => {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Clipboard text is required");
  }

  return setStringAsync(text);
};