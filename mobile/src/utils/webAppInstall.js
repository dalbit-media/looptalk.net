let deferredInstallPrompt = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "/app/manifest.webmanifest";
    document.head.appendChild(manifestLink);
  }
}

export const installWebApp = async () => {
  if (typeof window === "undefined") return;
  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.error("Could not show the web app install prompt:", error);
    }
    return;
  }
};
