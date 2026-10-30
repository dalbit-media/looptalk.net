import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
import { useAuthStore } from "../../store/authStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import { registerDeviceToken } from "../../api/auth";
import { getCallPushToken } from "../../utils/callNotifications";
import { InvitationSetup } from "../../components/InvitationSetup";
import { SocialAuthButtons } from "../../components/SocialAuthButtons";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { generateUsername, normalizeIdentifier, isUsername } from "../../utils/accountPrivacy";

const enableWebPush = async () => {
  const deviceToken = await getCallPushToken();
  await registerDeviceToken(deviceToken, "web", useAuthStore.getState().token);
  await usePreferencesStore.getState().setNotificationsEnabled(true);
};

export const RegisterScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState(() => generateUsername());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [socialError, setSocialError] = useState("");
  const [socialBusy, setSocialBusy] = useState(false);
  const invitationCode = route.params?.invitationCode || route.params?.code;
  const register = useAuthStore((state) => state.register);

  const handleRegister = async () => {
    if (loading || socialBusy) return;
    let normalized;
    try {
      normalized = normalizeIdentifier(identifier);
      if (!isUsername(normalized)) throw new Error("Invalid username");
    } catch {
      setErrorMessage(t("auth.invalidUsername"));
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setErrorMessage(t(password.length < 8 ? "auth.passwordLength" : "auth.passwordTooLong"));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t("auth.passwordMismatch"));
      return;
    }
    const name = displayName.trim();
    if (name.length > 100) {
      setErrorMessage(t("auth.displayNameTooLong"));
      return;
    }    setErrorMessage("");
    setLoading(true);
    try {
      await register(normalized, password, name, invitationCode);
      if (Platform.OS === "web" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        enableWebPush().catch(() => {});
      }
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
    } catch (error) {
      setErrorMessage(t(
        error.response?.status === 409
          ? "auth.userExists"
          : invitationCode && (error.response?.status === 400 || error.response?.status === 403)
          ? "auth.invalidInvitation"
          : error.request && !error.response
            ? "auth.serverUnavailable"
            : "privacy.registrationFailed"
      ));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("auth.createAccount")}</Text>
        {invitationCode && Platform.OS === "web" ? <InvitationSetup /> : null}
        <SocialAuthButtons
          mode="register"
          invitationCode={invitationCode}
          displayName={displayName.trim()}
          disabled={loading}
          onError={setSocialError}
          onBusyChange={setSocialBusy}
        />
        {socialError ? <Text accessibilityRole="alert" style={styles.error}>{socialError}</Text> : null}
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>{t("auth.orUsePassword")}</Text>
          <View style={styles.divider} />
        </View>
            <Text style={styles.notice}>{t("auth.credentialNotice")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.username")}
              accessibilityLabel={t("auth.username")}
              placeholderTextColor={colors.mutedText}
              value={identifier}
              onChangeText={(value) => setIdentifier(value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              maxLength={30}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setIdentifier(generateUsername())} disabled={loading} accessibilityRole="button">
              <Text style={styles.link}>{t("auth.randomUsername")}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={t("auth.password")}
              accessibilityLabel={t("auth.password")}
              placeholderTextColor={colors.mutedText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={128}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder={t("auth.confirmPassword")}
              accessibilityLabel={t("auth.confirmPassword")}
              placeholderTextColor={colors.mutedText}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={128}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder={t("auth.displayNameOptional")}
              accessibilityLabel={t("auth.displayNameOptional")}
              placeholderTextColor={colors.mutedText}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="off"
              maxLength={100}
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={handleRegister}
            />
            {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
            <TouchableOpacity
              style={[styles.button, loading && styles.disabled]}
              disabled={loading}
              onPress={handleRegister}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("auth.registerButton")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate("Login")} disabled={loading}>
              <Text style={styles.link}>{t("auth.alreadyHaveAccount")}</Text>
            </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 20 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  notice: { fontSize: 15, lineHeight: 23, color: colors.secondaryText },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, backgroundColor: colors.input },
  button: { backgroundColor: colors.action, padding: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  link: { color: colors.primary, textAlign: "center", padding: 12 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.mutedText, fontSize: 12 },
});
