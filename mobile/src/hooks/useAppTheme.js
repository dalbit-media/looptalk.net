import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { usePreferencesStore } from "../store/preferencesStore";

const lightColors = {
  background: "#FAFAF7",
  surface: "#FAFAF7",
  text: "#2B2D31",
  secondaryText: "#565B59",
  mutedText: "#6D736F",
  border: "#DEDFD7",
  input: "#E8E7E0",
  primary: "#186661",
  action: "#5B3FD9",
  onAction: "#FFFFFF",
  navigationAccent: "#186661",
  primarySoft: "#E1EEEA",
  header: "#1C2D49",
  headerText: "#F0F2F5",
  headerIcon: "#C3CCD8",
  tabBar: "#FAFAF7",
  sentBubble: "#1C2D49",
  onSentBubble: "#F0F2F5",
  receivedBubble: "#E8E7E0",
  unreadBadge: "#E87355",
  onUnreadBadge: "#2B2D31",
  online: "#186661",
  onlineOnHeader: "#76D7B7",
  danger: "#B83D2F",
  dangerSoft: "#FBE9E4",
};

const darkColors = {
  background: "#1C1F26",
  surface: "#1C1F26",
  text: "#F0F2F5",
  secondaryText: "#BCC2C8",
  mutedText: "#9CA5AE",
  border: "#363D45",
  input: "#2B323A",
  primary: "#326DB3",
  action: "#6C5CE7",
  onAction: "#FFFFFF",
  primarySoft: "#253B53",
  header: "#252C34",
  headerText: "#F0F2F5",
  headerIcon: "#B8C1CB",
  tabBar: "#252C34",
  sentBubble: "#5C9EFF",
  onSentBubble: "#1C2D49",
  receivedBubble: "#2D353D",
  unreadBadge: "#F3B943",
  onUnreadBadge: "#2B2D31",
  online: "#76D7B7",
  onlineOnHeader: "#76D7B7",
  danger: "#FF927D",
  dangerSoft: "#402D2D",
  navigationAccent: "#5C9EFF",
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
          primary: colors.navigationAccent,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.unreadBadge,
        },
      },
    };
};