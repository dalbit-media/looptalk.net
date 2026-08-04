import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAppTheme } from "../hooks/useAppTheme";

export const EmptyState = ({ icon, title, message, action }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
  <View style={styles.container}>
    <Ionicons name={icon} size={56} color={colors.mutedText} />
    <Text style={styles.title}>{title}</Text>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {action ? (
      <TouchableOpacity style={styles.action} onPress={action.onPress}>
        <Ionicons name={action.icon} size={22} color={colors.primary} />
        <Text style={styles.actionText}>{action.label}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    marginTop: 16,
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  message: {
    marginTop: 8,
    color: colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },
  actionText: {
    marginLeft: 6,
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});