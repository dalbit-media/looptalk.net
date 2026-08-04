import React from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

// Reusable search input with a leading search icon and a clear ("x") button.
export const SearchBar = ({
  value,
  onChangeText,
  placeholder,
  colors,
  autoFocus,
  onSubmitEditing,
  style,
  rightAccessory,
}) => {
  const styles = createStyles(colors);
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="search" size={18} color={colors.mutedText} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
      />
      {value ? (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.mutedText} />
        </TouchableOpacity>
      ) : null}
      {rightAccessory}
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.input,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
      outlineStyle: "none",
    },
  });
