import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";

// Guests signed up without an invitation; this is their way to join a network later.
export const GuestJoinBanner = ({ onPress }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const isGuest = useAuthStore((state) => state.user?.member === false);
  if (!isGuest) return null;
  const styles = createStyles(colors);
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("join.cta")}
      accessibilityHint={t("join.bannerBody")} onPress={onPress} style={styles.banner}>
      <Ionicons name="ticket-outline" size={22} color={colors.primary} />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{t("join.bannerTitle")}</Text>
        <Text style={styles.body} numberOfLines={1} ellipsizeMode="tail">{t("join.bannerBody")}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
    </TouchableOpacity>
  );
};

const createStyles = (colors) => StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 8,
    padding: 10, minHeight: 60, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  body: { fontSize: 13, lineHeight: 18, color: colors.secondaryText },
});
