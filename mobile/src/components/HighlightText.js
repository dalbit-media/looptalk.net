import React from "react";
import { Text, StyleSheet } from "react-native";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Splits `text` on `query` (case-insensitive) and wraps matches in a highlight span.
export const HighlightText = ({
  text,
  query,
  style,
  highlightStyle,
  active,
  numberOfLines,
}) => {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || text == null || text === "") {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const source = String(text);
  const lowerQuery = trimmedQuery.toLowerCase();
  const parts = source.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi"));

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        part.toLowerCase() === lowerQuery ? (
          <Text
            key={index}
            style={[
              styles.highlight,
              active && styles.activeHighlight,
              highlightStyle,
            ]}
          >
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
};

const styles = StyleSheet.create({
  highlight: {
    backgroundColor: "#FFE066",
    color: "#3D2E00",
    borderRadius: 3,
  },
  activeHighlight: {
    backgroundColor: "#FF9F1C",
    color: "#2B1800",
  },
});
