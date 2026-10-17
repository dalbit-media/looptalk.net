import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText as Text } from "./AppText";
import { useMessageStore } from "../store/messageStore";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";

export const UserPresence = ({ user, compact = false, onHeader = false }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const onlineColor = onHeader ? colors.onlineOnHeader : colors.online;
  const online = useMessageStore((state) =>
    state.presenceConnected && state.onlineUsers.has(user.id)
  );
  const connected = useMessageStore((state) => state.presenceConnected);
  const lastActiveAt = useMessageStore((state) =>
    state.presenceByUser[user.id]?.lastActiveAt || user.lastActiveAt
  );
  let label = online ? t("profile.online") : t("presence.offline");
  if (!connected) label = t("presence.connecting");
  if (!online && lastActiveAt) {
    label = t("presence.lastActive", {
      time: new Date(lastActiveAt).toLocaleString("ko-KR", {
        ...(compact ? {} : { year: "numeric" }),
        month: compact ? "numeric" : "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: !compact,
      }),
    });
    if (!connected) label = `${t("presence.connecting")} · ${label}`;
  }
  return (
    <View style={[styles.status, compact && styles.compact]}>
      {online && <View style={[styles.indicator, { backgroundColor: onlineColor }]} />}
      <Text
        style={[styles.text, {
          color: online ? onlineColor : onHeader ? colors.headerIcon : colors.mutedText,
        }]}
        numberOfLines={compact ? 2 : undefined}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  compact: { marginTop: 4 },
  indicator: { width: 6, height: 6, borderRadius: 3 },
  text: { flexShrink: 1, fontSize: 12, fontWeight: "500" },
});
