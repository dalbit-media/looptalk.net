import React from "react";
import { Linking, StyleSheet } from "react-native";
import { AppText as Text } from "./AppText";
import { API_URL } from "../config/environment";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";

// Account creation is consent to the Terms (including zero tolerance for abuse) and the Privacy Policy.
export const TermsNotice = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const open = (path) => () => Linking.openURL(`${API_URL}${path}`).catch(() => {});
  return (
    <Text style={styles.notice}>
      {t("auth.termsPrefix")}
      <Text style={styles.link} accessibilityRole="link" onPress={open("/terms")}>{t("auth.termsLink")}</Text>
      {t("auth.termsJoin")}
      <Text style={styles.link} accessibilityRole="link" onPress={open("/privacy")}>{t("auth.privacyLink")}</Text>
      {t("auth.termsSuffix")}
    </Text>
  );
};

const createStyles = (colors) => StyleSheet.create({
  notice: { fontSize: 12, lineHeight: 18, color: colors.mutedText, textAlign: "center" },
  link: { color: colors.primary, textDecorationLine: "underline" },
});
