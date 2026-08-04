import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { useAuthStore } from "../store/authStore";
import { showAlert } from "../utils/showAlert";

WebBrowser.maybeCompleteAuthSession();

const GoogleAuthButton = ({
  clientConfigured,
  disabled,
  invitationCode,
  displayName,
  styles,
  colors,
  t,
}) => {
  if (!clientConfigured) {
    return (
      <TouchableOpacity
        style={styles.providerButton}
        onPress={() => showAlert(t("common.error"), t("auth.socialUnavailable"))}
        disabled={disabled}
      >
        <Ionicons name="logo-google" size={20} color={colors.text} />
        <Text style={styles.providerText}>{t("auth.continueWithGoogle")}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <ConfiguredGoogleAuthButton
      disabled={disabled}
      invitationCode={invitationCode}
      displayName={displayName}
      styles={styles}
      colors={colors}
      t={t}
    />
  );
};

const ConfiguredGoogleAuthButton = ({
  disabled,
  invitationCode,
  displayName,
  styles,
  colors,
  t,
}) => {
  const socialAuth = useAuthStore((state) => state.socialAuth);
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    selectAccount: true,
  });

  useEffect(() => {
    if (response?.type !== "success" || !response.params.id_token) return;
    setLoading(true);
    socialAuth(
      "google",
      response.params.id_token,
      invitationCode,
      displayName
    )
      .catch(() => showAlert(t("auth.loginFailed"), t("common.error")))
      .finally(() => setLoading(false));
  }, [response]);

  return (
    <TouchableOpacity
      style={styles.providerButton}
      onPress={() => promptAsync()}
      disabled={disabled || loading || !request}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Ionicons name="logo-google" size={20} color={colors.text} />
          <Text style={styles.providerText}>{t("auth.continueWithGoogle")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

export const SocialAuthButtons = ({ invitationCode, displayName, disabled }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const socialAuth = useAuthStore((state) => state.socialAuth);
  const [activeProvider, setActiveProvider] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleClientId =
    Platform.OS === "web"
      ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      : Platform.OS === "ios"
        ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
        : process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleApple = async () => {
    if (!appleAvailable || Platform.OS !== "ios") {
      showAlert(t("common.error"), t("auth.socialUnavailable"));
      return;
    }

    try {
      setActiveProvider("apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Missing Apple identity token");
      const appleDisplayName = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName)
        : displayName;
      await socialAuth(
        "apple",
        credential.identityToken,
        invitationCode,
        appleDisplayName
      );
    } catch (error) {
      if (error.code !== "ERR_REQUEST_CANCELED") {
        showAlert(t("auth.loginFailed"), t("common.error"));
      }
    } finally {
      setActiveProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>{t("auth.orContinueWith")}</Text>
        <View style={styles.divider} />
      </View>

      {Platform.OS === "ios" && (
        <TouchableOpacity
          style={styles.providerButton}
          onPress={handleApple}
          disabled={disabled || activeProvider !== null}
        >
          {activeProvider === "apple" ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={22} color={colors.text} />
              <Text style={styles.providerText}>{t("auth.continueWithApple")}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <GoogleAuthButton
        clientConfigured={Boolean(googleClientId)}
        disabled={disabled || activeProvider !== null}
        invitationCode={invitationCode}
        displayName={displayName}
        styles={styles}
        colors={colors}
        t={t}
      />
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { gap: 12 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.mutedText, fontSize: 12 },
  providerButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  providerText: { color: colors.text, fontSize: 15, fontWeight: "600" },
});