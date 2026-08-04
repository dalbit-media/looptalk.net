import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from "react-native";
import { useAlertStore } from "../store/alertStore";
import { useAppTheme } from "../hooks/useAppTheme";

// Renders the web fallback for Alert.alert() (see utils/showAlert.js).
// Only meaningful on web — react-native-web's Alert.alert() is a no-op, so
// without this, every confirmation/error dialog in the app would silently
// do nothing on web (login/registration errors, logout confirm, message
// reactions, reply/edit/delete menus, etc.).
export const WebAlertHost = () => {
  const { colors } = useAppTheme();
  const request = useAlertStore((state) => state.request);
  const hide = useAlertStore((state) => state.hide);

  if (Platform.OS !== "web" || !request) return null;

  const styles = createStyles(colors);
  const buttons =
    request.buttons && request.buttons.length > 0
      ? request.buttons
      : [{ text: "OK" }];

  const handlePress = (button) => {
    hide();
    button.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={hide}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={hide}
      >
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          {!!request.title && <Text style={styles.title}>{request.title}</Text>}
          {!!request.message && <Text style={styles.message}>{request.message}</Text>}
          <View style={styles.buttonList}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={`${button.text}-${index}`}
                style={[
                  styles.button,
                  index < buttons.length - 1 && styles.buttonBorder,
                ]}
                onPress={() => handlePress(button)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === "destructive" && styles.destructiveText,
                    button.style === "cancel" && styles.cancelText,
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingTop: 20,
      paddingHorizontal: 20,
      overflow: "hidden",
    },
    title: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 6,
    },
    message: {
      fontSize: 14,
      color: colors.secondaryText,
      textAlign: "center",
      marginBottom: 16,
    },
    buttonList: {
      marginHorizontal: -20,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    button: {
      paddingVertical: 14,
      alignItems: "center",
    },
    buttonBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    buttonText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: "500",
    },
    destructiveText: {
      color: colors.danger,
    },
    cancelText: {
      color: colors.secondaryText,
      fontWeight: "600",
    },
  });
