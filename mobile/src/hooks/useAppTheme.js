import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { usePreferencesStore } from "../store/preferencesStore";

const lightColors = {
  background: "#F8F8F8",
  surface: "#FFFFFF",
  text: "#000000",
  secondaryText: "#666666",
  mutedText: "#8E8E93",
  border: "#E5E5EA",
  input: "#F2F2F7",
  primary: "#007AFF",
  primarySoft: "#EAF4FF",
  danger: "#FF3B30",
  dangerSoft: "#FFF5F5",
};

const darkColors = {
  background: "#000000",
  surface: "#1C1C1E",
  text: "#FFFFFF",
  secondaryText: "#AEAEB2",
  mutedText: "#8E8E93",
  border: "#38383A",
  input: "#2C2C2E",
  primary: "#0A84FF",
  primarySoft: "#102A43",
  danger: "#FF453A",
  dangerSoft: "#351416",
};

export const useAppTheme = () => {
  const systemColorScheme = useColorScheme();
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemColorScheme === "dark");
  const colors = isDark ? darkColors : lightColors;
  const baseTheme = isDark ? DarkTheme : DefaultTheme;

  return {
    colors,
    isDark,
    themeMode,
    navigationTheme: {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    },
  };
};