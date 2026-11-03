module.exports = ({ config }) => {
  const isProductionBuild = process.env.EAS_BUILD_PROFILE === "production";
  const apiUrl = (process.env.EXPO_PUBLIC_API_URL?.trim() ||
    (isProductionBuild ? "https://looptalk.net" : ""))?.replace(/\/+$/, "");
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || config.extra?.eas?.projectId;

  if (isProductionBuild) {
    if (!projectId) {
      throw new Error("Missing production build variables: EXPO_PUBLIC_EAS_PROJECT_ID");
    }
    if (!apiUrl.startsWith("https://")) {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for production builds");
    }
  }

  return {
    ...config,
    runtimeVersion: { policy: "appVersion" },
    updates: projectId
      ? { url: `https://u.expo.dev/${projectId}`, checkAutomatically: "ON_LOAD" }
      : undefined,
    extra: {
      ...config.extra,
      eas: projectId ? { projectId } : undefined,
      legal: apiUrl
        ? {
            privacyPolicyUrl: `${apiUrl}/privacy`,
            termsUrl: `${apiUrl}/terms`,
            supportUrl: `${apiUrl}/support`,
            accountDeletionUrl: `${apiUrl}/account-deletion`,
          }
        : undefined,
    },
  };
};
