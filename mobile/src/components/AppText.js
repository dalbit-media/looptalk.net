import React, { createContext, forwardRef, useContext } from "react";
import { StyleSheet, Text as NativeText } from "react-native";
import { usePreferencesStore } from "../store/preferencesStore";
import { getAppTextScale } from "../utils/chatTextSize";

const NestedTextContext = createContext(false);
export const AppTextScaleContext = createContext(1);

export const AppTextScaleProvider = ({ children }) => {
  const textSize = usePreferencesStore((state) => state.chatTextSize);
  return (
    <AppTextScaleContext.Provider value={getAppTextScale(textSize)}>
      {children}
    </AppTextScaleContext.Provider>
  );
};

export const AppText = forwardRef(function AppText(
  { allowGlobalTextScale = true, style, ...props },
  ref
) {
  const isNested = useContext(NestedTextContext);
  const appTextScale = useContext(AppTextScaleContext);
  const scale = allowGlobalTextScale ? appTextScale : 1;
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const scaledStyle = {
    ...flattenedStyle,
    ...(flattenedStyle.fontSize != null
      ? { fontSize: flattenedStyle.fontSize * scale }
      : !isNested && allowGlobalTextScale
        ? { fontSize: 14 * scale }
        : {}),
  };

  return (
    <NestedTextContext.Provider value>
      <NativeText ref={ref} style={scaledStyle} {...props} />
    </NestedTextContext.Provider>
  );
});
