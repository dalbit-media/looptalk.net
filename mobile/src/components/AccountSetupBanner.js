import React from "react";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppInstall } from "../hooks/useAppInstall";
import { Banner } from "./GuestJoinBanner";

// Invitation accounts start with generated credentials; nudge members to make the account theirs,
// then offer optional installation.
export const AccountSetupBanner = ({ onPress }) => {
  const t = useTranslation();
  const member = useAuthStore((state) => state.user?.member !== false && Boolean(state.user));
  const dismissed = useAuthStore((state) => state.setupBannerDismissed);
  const dismiss = useAuthStore((state) => state.dismissSetupBanner);
  const setup = useAuthStore((state) => state.accountSetup);
  const { available: installable, label, hint, install } = useAppInstall();
  const personalize = Boolean(setup?.generated) && !setup.linkedProviders?.length;
  if (!member || dismissed || (!personalize && !installable)) return null;

  return (
    <Banner
      icon={personalize ? "person-circle-outline" : "download-outline"}
      title={personalize ? t("setup.bannerTitle") : label}
      body={personalize ? t("setup.bannerBody") : hint}
      onPress={personalize ? onPress : install}
      onDismiss={dismiss}
      dismissLabel={t("setup.dismiss")}
    />
  );
};
