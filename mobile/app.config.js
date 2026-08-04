module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/+$/, "");
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const isProductionBuild = process.env.EAS_BUILD_PROFILE === "production";

  if (isProductionBuild) {
    const missing = [
      ["EXPO_PUBLIC_API_URL", apiUrl],
      ["EXPO_PUBLIC_EAS_PROJECT_ID", projectId],
      ["EXPO_PUBLIC_SENTRY_DSN", sentryDsn],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new Error(`Missing production build variables: ${missing.join(", ")}`);
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
