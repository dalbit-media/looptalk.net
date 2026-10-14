import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { usePreferencesStore } from "../store/preferencesStore";

const LANGUAGES = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

export const LanguageFooter = () => {
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const { colors } = useAppTheme();
  const t = useTranslation();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.footer}>
        <Ionicons name="language-outline" size={18} color={colors.mutedText} />
        <View style={styles.options}>
          {LANGUAGES.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                language === option.value && styles.optionSelected,
              ]}
              onPress={() => setLanguage(option.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  language === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    marginTop: 32,
    paddingBottom: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  options: {
    flexDirection: "row",
    padding: 2,
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  option: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  optionSelected: {
    backgroundColor: colors.primary,
  },
  optionText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: "600",
  },
  optionTextSelected: {
    color: "#FFFFFF",
  },
});