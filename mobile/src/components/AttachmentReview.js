import React from "react";
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

export const AttachmentReview = ({
  items, original = false, onOriginalChange, onSend, onCancel, busy, status,
}) => {
  const { colors } = useAppTheme();
  const t = useTranslation();
  const styles = createStyles(colors);
  if (!items.length) return null;
  return (
    <View style={styles.container}>
      <ScrollView style={styles.files}>
        {items.map((item, index) => (
          <Text key={`${index}:${item.uri}`} style={styles.file} numberOfLines={1}>
            {item.name}{item.fileSize ? ` (${(item.fileSize / 1024 / 1024).toFixed(1)} MB)` : ""}
          </Text>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.original} accessibilityRole="checkbox"
        accessibilityLabel={t("messages.originalSize")} accessibilityState={{ checked: original, disabled: busy }}
        disabled={busy} onPress={() => onOriginalChange(!original)}>
        <Ionicons name={original ? "checkbox" : "square-outline"} size={16} color={colors.mutedText} />
        <Text style={styles.small}>{t("messages.originalSize")}</Text>
      </TouchableOpacity>
      <Text style={styles.small}>{t("messages.encodingHint")}</Text>
      {status ? <Text style={styles.small} accessibilityLiveRegion="polite">{status}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity disabled={busy} onPress={onCancel} accessibilityRole="button"
          accessibilityLabel={t("common.cancel")} style={styles.button}>
          <Text style={styles.small}>{t("common.cancel")}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={onSend} accessibilityRole="button"
          accessibilityLabel={t("messages.sendAttachments", { count: items.length })} style={styles.button}>
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> :
            <Text style={styles.send}>{t("messages.sendAttachments", { count: items.length })}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: 6 },
  files: { maxHeight: 100 },
  file: { fontSize: 13, color: colors.text, paddingVertical: 2 },
  original: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  small: { fontSize: 12, color: colors.mutedText },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  button: { paddingHorizontal: 8, paddingVertical: 8 },
  send: { fontSize: 13, color: colors.primary, fontWeight: "600" },
});
