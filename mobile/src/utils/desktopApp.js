// The packaged desktop app (desktop/src/preload.js) exposes this bridge; browsers and native apps do not.
export const getDesktopBridge = () =>
  typeof window !== "undefined" && typeof window.looptalkDesktop?.notify === "function"
    ? window.looptalkDesktop
    : null;

export const isDesktopApp = () => Boolean(getDesktopBridge());
