import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet } from "react-native";

// Horizontally-scrolling row of selectable filter chips.
export const FilterChips = ({ options, selectedKey, onSelect, colors, style }) => {
  const styles = createStyles(colors);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, style]}
    >
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onSelect(option.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={option.label}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      flexDirection: "row",
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.input,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.secondaryText,
    },
    chipTextSelected: {
      color: "#FFFFFF",
    },
  });
