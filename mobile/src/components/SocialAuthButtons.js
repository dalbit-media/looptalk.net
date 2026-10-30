import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { AppText as Text } from "./AppText";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { useAuthStore } from "../store/authStore";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const googleConfigured = Boolean(GOOGLE_CLIENT_IDS[Platform.OS] || GOOGLE_CLIENT_IDS.web);

const errorKey = (error) => {
  const status = error.response?.status;
  const code = error.response?.data?.code;
  if (code === "SOCIAL_ACCOUNT_EXISTS") return "auth.socialExists";
  if (code === "NO_LINKED_ACCOUNT") return "auth.socialNoAccount";
  if (status === 503) return "auth.socialUnavailable";
  if (status === 400 || status === 403) return "auth.invalidInvitation";
  if (error.request && !error.response) return "auth.serverUnavailable";
  return "auth.socialFailed";
};

const ProviderButton = ({ icon, label, onPress, disabled, loading, styles, colors }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.providerButton, disabled && styles.disabled]}
    onPress={onPress}
    disabled={disabled}
  >
    {loading ? <ActivityIndicator color={colors.text} /> : (
      <>
        <Ionicons name={icon} size={22} color={colors.text} />
        <Text style={styles.providerText}>{label}</Text>
      </>
    )}
  </TouchableOpacity>
);

const GoogleButton = ({ submit, disabled, busy, styles, colors, label }) => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.web,
    iosClientId: GOOGLE_CLIENT_IDS.ios,
    androidClientId: GOOGLE_CLIENT_IDS.android,
    selectAccount: true,
  });

  useEffect(() => {
    if (response?.type === "success" && response.params.id_token) submit("google", response.params.id_token);
  }, [response]);

  return (
    <ProviderButton
      icon="logo-google" label={label} styles={styles} colors={colors}
      onPress={() => promptAsync()} disabled={disabled || !request} loading={busy === "google"}
    />
  );
};

// Apple and Google are offered first; the identity is linked solely so the account can be recovered.
export const SocialAuthButtons = ({ mode = "register", invitationCode, displayName, disabled, onError, onBusyChange }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const socialRegister = useAuthStore((state) => state.socialRegister);
  const socialRecover = useAuthStore((state) => state.socialRecover);
  const [busy, setBusy] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const recover = mode === "recover";

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const submit = async (provider, idToken, providerName) => {
    setBusy(provider);
    onBusyChange?.(true);
    onError?.("");
    try {
      if (recover) await socialRecover({ provider, idToken });
      else await socialRegister({ provider, idToken, displayName: displayName || providerName, invitationCode });
    } catch (error) {
      onError?.(t(errorKey(error)));
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  };

  const handleApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
      if (!credential.identityToken) throw new Error("Missing Apple identity token");
      const name = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : "";
      await submit("apple", credential.identityToken, name);
    } catch (error) {
      if (error.code !== "ERR_REQUEST_CANCELED") onError?.(t("auth.socialFailed"));
    }
  };

  const off = disabled || busy !== null;
  const verb = recover ? "auth.recoverWith" : "auth.continueWith";
  if (!appleAvailable && !googleConfigured) return null;

  return (
    <View style={styles.container}>
      {appleAvailable ? (
        <ProviderButton
          icon="logo-apple" label={t(`${verb}Apple`)} styles={styles} colors={colors}
          onPress={handleApple} disabled={off} loading={busy === "apple"}
        />
      ) : null}
      {googleConfigured ? (
        <GoogleButton submit={submit} disabled={off} busy={busy} styles={styles} colors={colors} label={t(`${verb}Google`)} />
      ) : null}
      <View style={styles.noteRow}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.mutedText} />
        <Text style={styles.note}>{t(recover ? "auth.socialRecoverNote" : "auth.socialRecoveryNote")}</Text>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { gap: 12 },
  providerButton: {
    minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface,
  },
  providerText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  noteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  note: { flexShrink: 1, color: colors.mutedText, fontSize: 12, lineHeight: 17, textAlign: "center" },
});
