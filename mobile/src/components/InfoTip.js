import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

// Compact info icon that reveals detail text on hover (web) or touch.
// The bubble floats on web; on native it expands in place so it is never clipped.
export const InfoTip = ({ text, align = "left", style }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const iconRef = useRef(null);
  const visible = pinned || hovered;
  const styles = createStyles(colors);
  const floating = Platform.OS === "web";

  useEffect(() => {
    if (!floating || !visible) return undefined;
    const measure = () => {
      const node = iconRef.current;
      if (node && node.getBoundingClientRect) setAnchor(node.getBoundingClientRect());
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [floating, visible]);

  if (!text) return null;

  const renderBubble = () => {
    if (!floating) {
      return (
        <View accessibilityRole="alert" style={styles.bubble}>
          <Text style={styles.text}>{text}</Text>
        </View>
      );
    }
    if (!anchor || typeof document === "undefined") return null;
    const width = Math.min(280, window.innerWidth - 16);
    const preferred = align === "right" ? anchor.right - width : align === "center" ? anchor.left + anchor.width / 2 - width / 2 : anchor.left;
    const left = Math.max(8, Math.min(preferred, window.innerWidth - width - 8));
    const below = anchor.bottom + 6;
    const top = below + 160 > window.innerHeight && anchor.top > 200 ? undefined : below;
    const bottom = top === undefined ? window.innerHeight - anchor.top + 6 : undefined;
    const { createPortal } = require("react-dom");
    return createPortal(
      <View
        accessibilityRole="alert"
        pointerEvents="none"
        style={[styles.bubble, styles.floating, { left, top, bottom, width }]}
      >
        <Text style={styles.text}>{text}</Text>
      </View>,
      document.body,
    );
  };

  return (
    <View style={[styles.container, style]}>
      <Pressable
        ref={iconRef}
        accessibilityRole="button"
        accessibilityLabel={t("common.info")}
        accessibilityState={{ expanded: visible }}
        hitSlop={10}
        onPress={() => setPinned((value) => !value)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onBlur={() => setPinned(false)}
        style={styles.icon}
      >
        <Ionicons name="information-circle-outline" size={20} color={colors.secondaryText} />
      </Pressable>
      {visible ? renderBubble() : null}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { alignSelf: "flex-start" },
  icon: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  bubble: {
    maxWidth: 320,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.navigationAccent || colors.border,
    backgroundColor: colors.surface,
    opacity: 1,
  },
  floating: { position: "fixed", zIndex: 2147483000, boxShadow: "0 6px 20px rgba(0,0,0,0.45)" },
  text: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
