import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppInstall } from "../hooks/useAppInstall";
import { Banner } from "./GuestJoinBanner";
import { isDesktopApp } from "../utils/desktopApp";
import { showAlert } from "../utils/showAlert";
import { browserNotificationPermission, enablePushNotifications } from "../utils/pushRegistration";

// Invitation accounts start with generated credentials; nudge members to make the account theirs,
// then to allow notifications in this browser, then to optionally install the app.
export const AccountSetupBanner = ({ onPress }) => {
  const t = useTranslation();
  const member = useAuthStore((state) => state.user?.member !== false && Boolean(state.user));
  const dismissed = useAuthStore((state) => state.setupBannerDismissed);
  const dismiss = useAuthStore((state) => state.dismissSetupBanner);
  const setup = useAuthStore((state) => state.accountSetup);
  const { available: installable, label, hint } = useAppInstall();
  const [permission, setPermission] = useState(browserNotificationPermission);
  const personalize = Boolean(setup?.generated) && !setup.linkedProviders?.length;
  const askNotifications = permission === "default" && !isDesktopApp();
  if (!member || dismissed || (!personalize && !askNotifications && !installable)) return null;

  if (!personalize && askNotifications) {
    const turnOn = async () => {
      try {
        const result = await enablePushNotifications();
        setPermission(result);
        if (result === "denied") showAlert(t("common.error"), t("settings.notificationsDenied"));
      } catch (error) {
        console.error("Could not enable notifications:", error);
        showAlert(t("common.error"), t("settings.notificationsFailed"));
      }
    };
    return (
      <Banner icon="notifications-outline" title={t("setup.notificationsTitle")} body={t("setup.notificationsBody")}
        onPress={turnOn} onDismiss={dismiss} dismissLabel={t("setup.dismiss")} />
    );
  }

  return (
    <Banner
      icon={personalize ? "person-circle-outline" : "download-outline"}
      title={personalize ? t("setup.bannerTitle") : label}
      body={personalize ? t("setup.bannerBody") : hint}
      onPress={onPress}
      onDismiss={dismiss}
      dismissLabel={t("setup.dismiss")}
    />
  );
};
