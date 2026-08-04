import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

export const AttachmentSheet = ({ visible, onClose, onSelect }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const options = [
    { key: "camera", icon: "camera", label: t("messages.camera"), color: "#FF9500" },
    { key: "library", icon: "images", label: t("messages.photoLibrary"), color: "#34C759" },
    { key: "file", icon: "document-attach", label: t("messages.file"), color: "#007AFF" },
    { key: "voice", icon: "mic", label: t("messages.voiceMessage"), color: "#FF3B30" },
    { key: "drawing", icon: "brush", label: t("messages.drawing"), color: "#AF52DE" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.grid}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.option}
                onPress={() => onSelect(option.key)}
              >
                <View style={[styles.iconCircle, { backgroundColor: option.color }]}>
                  <Ionicons name={option.icon} size={26} color="#fff" />
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 10,
      paddingBottom: 32,
      paddingHorizontal: 16,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 16,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 18,
    },
    option: {
      alignItems: "center",
      width: "25%",
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    optionLabel: {
      color: colors.text,
      fontSize: 12,
      textAlign: "center",
    },
  });
