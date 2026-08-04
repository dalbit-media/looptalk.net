import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { BrandMark } from "./BrandMark";

export const AppSplash = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <BrandMark size={88} />
        <Text style={[styles.brand, { color: colors.text }]}>{t("brand.name")}</Text>
        <Text style={[styles.status, { color: colors.mutedText }]}>
          {t("onboarding.preparing")}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  brand: {
    marginTop: 20,
    fontSize: 34,
    fontWeight: "800",
  },
  status: {
    marginTop: 8,
    fontSize: 14,
  },
});