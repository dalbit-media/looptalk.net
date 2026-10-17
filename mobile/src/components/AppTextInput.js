import React, { forwardRef, useContext } from "react";
import { StyleSheet, TextInput as NativeTextInput } from "react-native";
import { AppTextScaleContext } from "./AppText";

export const AppTextInput = forwardRef(function AppTextInput(
  { allowGlobalTextScale = true, style, ...props },
  ref
) {
  const appTextScale = useContext(AppTextScaleContext);
  const scale = allowGlobalTextScale ? appTextScale : 1;
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const scaledStyle = {
    ...flattenedStyle,
    fontSize: (flattenedStyle.fontSize ?? 14) * scale,
  };

  return <NativeTextInput ref={ref} style={scaledStyle} {...props} />;
});
