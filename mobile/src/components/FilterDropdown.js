import React, { useRef, useState } from "react";
import { View, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, Dimensions } from "react-native";
import { AppText as Text } from "./AppText";
import Ionicons from "@expo/vector-icons/Ionicons";

// Icon button that opens a dropdown menu of filter options anchored below it.
export const FilterDropdown = ({ options, selectedKey, onSelect, colors, style }) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const buttonRef = useRef(null);
  const styles = createStyles(colors);
  const isActive = !!selectedKey && selectedKey !== options[0]?.key;

  const openMenu = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const handleSelect = (key) => {
    onSelect(key);
    setOpen(false);
  };

  const { width: windowWidth, height: windowHeight } = Dimensions.get("window");
  const estimatedMenuHeight = options.length * 40 + 12;
  const menuPosition = anchor
    ? (() => {
        const belowTop = anchor.y + anchor.height + 6;
        const belowSpace = Math.max(windowHeight - belowTop - 8, 0);
        const aboveSpace = Math.max(anchor.y - 8, 0);
        const placeAbove =
          estimatedMenuHeight > belowSpace && aboveSpace > belowSpace;
        return {
          top: placeAbove
            ? Math.max(anchor.y - Math.min(estimatedMenuHeight, aboveSpace) - 6, 8)
            : belowTop,
          maxHeight: placeAbove ? aboveSpace : belowSpace,
          right: Math.max(windowWidth - (anchor.x + anchor.width), 8),
        };
      })()
    : null;

  return (
    <View style={style}>
      <TouchableOpacity
        ref={buttonRef}
        style={[styles.iconButton, isActive && styles.iconButtonActive]}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Filter"
      >
        <Ionicons name="filter" size={18} color={isActive ? "#FFFFFF" : colors.mutedText} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
          {anchor && (
            <View
              style={[styles.dropdown, menuPosition]}
            >
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {options.map((option) => {
                  const selected = option.key === selectedKey;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={styles.option}
                      onPress={() => handleSelect(option.key)}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                        {option.label}
                      </Text>
                      {selected && (
                        <Ionicons name="checkmark" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.input,
      justifyContent: "center",
      alignItems: "center",
    },
    iconButtonActive: {
      backgroundColor: colors.primary,
    },
    dropdown: {
      position: "absolute",
      minWidth: 170,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 6,
      overflow: "hidden",
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    optionText: {
      fontSize: 14,
      color: colors.text,
    },
    optionTextSelected: {
      color: colors.primary,
      fontWeight: "600",
    },
  });
