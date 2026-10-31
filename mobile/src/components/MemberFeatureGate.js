import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

export const MemberFeatureGate = ({ message, onJoinNetwork, compact = false }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <View style={[styles.card, compact ? styles.compactCard : styles.fullCard]}>
      <View style={[styles.icon, compact && styles.compactIcon]}>
        <Ionicons name="lock-closed" size={compact ? 17 : 22} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t("memberAccess.title")}</Text>
        <Text style={styles.message}>{t(message)}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onJoinNetwork}
          style={styles.action}
        >
          <Ionicons name="ticket-outline" size={17} color={colors.primary} />
          <Text style={styles.actionText}>{t("join.cta")}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: {
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  fullCard: {
    width: "100%",
  },
  compactCard: {
    maxWidth: undefined,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    gap: 10,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    color: colors.secondaryText,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    minHeight: 38,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 4,
  },
  actionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});
