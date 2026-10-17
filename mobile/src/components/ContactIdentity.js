import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { AppText as Text } from "./AppText";
import { HighlightText } from "./HighlightText";
import { UserPresence } from "./UserPresence";
import { API_URL } from "../config/environment";

export const ContactIdentity = ({
  user,
  displayName,
  searchQuery = "",
  showOnline = false,
  colors,
}) => {
  const styles = createStyles(colors);
  const name = displayName || user.displayName;
  const avatarUri = user.profilePicture ? `${API_URL}${user.profilePicture}` : null;

  return (
    <View style={styles.identity}>
      <View style={styles.avatar}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{(name?.[0] || "?").toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.info}>
        <HighlightText
          text={name}
          query={searchQuery}
          style={styles.name}
          numberOfLines={1}
        />
        <HighlightText
          text={`@${user.username}`}
          query={searchQuery}
          style={styles.username}
          numberOfLines={1}
        />
        {showOnline && <UserPresence user={user} compact />}
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  username: {
    fontSize: 12,
    color: colors.mutedText,
    marginTop: 2,
  },
});
