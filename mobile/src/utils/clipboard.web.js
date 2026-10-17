import { setStringAsync } from "expo-clipboard";

const copyTextOnWeb = (text) => {
  if (globalThis.navigator?.clipboard && globalThis.isSecureContext) {
    return globalThis.navigator.clipboard.writeText(text);
  }

  const textarea = globalThis.document?.createElement("textarea");
  if (!textarea) throw new Error("Clipboard is unavailable");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  globalThis.document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!globalThis.document.execCommand("copy")) {
      throw new Error("Clipboard copy was rejected");
    }
  } finally {
    globalThis.document.body.removeChild(textarea);
  }
};

export const copyText = async (text) => {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Clipboard text is required");
  }

  return copyTextOnWeb(text) || setStringAsync(text);
};