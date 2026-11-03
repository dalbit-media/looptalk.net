import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";

// Shared site-wide banner shell; each banner decides only when it shows and what it says.
export const Banner = ({ icon, title, body, onPress, onDismiss, dismissLabel }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={title}
        accessibilityHint={body} onPress={onPress} style={styles.banner}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.body} numberOfLines={1} ellipsizeMode="tail">{body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
      </TouchableOpacity>
      {onDismiss ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={dismissLabel} onPress={onDismiss}
          hitSlop={8} style={styles.dismiss}>
          <Ionicons name="close" size={18} color={colors.mutedText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

// Guests signed up without an invitation; this is their way to join a network later.
export const GuestJoinBanner = ({ onPress }) => {
  const t = useTranslation();
  const isGuest = useAuthStore((state) => state.user?.member === false);
  if (!isGuest) return null;
  return <Banner icon="ticket-outline" title={t("join.bannerTitle")} body={t("join.bannerBody")} onPress={onPress} />;
};

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  dismiss: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
  banner: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, minHeight: 60, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  body: { fontSize: 13, lineHeight: 18, color: colors.secondaryText },
});
