import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
import { useAuthStore } from "../../store/authStore";
import * as AuthAPI from "../../api/auth";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { normalizeIdentifier } from "../../utils/accountPrivacy";

export const RegisterScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [bootstrapAvailable, setBootstrapAvailable] = useState(null);
  const invitationCode = route.params?.invitationCode || route.params?.code;
  const register = useAuthStore((state) => state.register);

  useEffect(() => {
    let active = true;
    AuthAPI.getBootstrapStatus()
      .then(({ bootstrapAvailable: available }) => {
        if (active) setBootstrapAvailable(available);
      })
      .catch(() => {
        if (active) setBootstrapAvailable(false);
      });
    return () => { active = false; };
  }, []);

  const handleRegister = async () => {
    if (loading) return;
    let normalized;
    try {
      normalized = normalizeIdentifier(identifier);
    } catch {
      setErrorMessage(t(identifier.includes("@") ? "auth.invalidEmail" : "auth.invalidPhoneNumber"));
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
    if (!name || name.length > 100) {
      setErrorMessage(t(name ? "auth.displayNameTooLong" : "auth.displayNameRequired"));
      return;
    }
    if (!invitationCode && bootstrapAvailable !== true) {
      setErrorMessage(t("auth.invitationRequired"));
      return;
    }
    setErrorMessage("");
    setLoading(true);
    try {
      await register(normalized, password, name, invitationCode);
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
    } catch (error) {
      setErrorMessage(t(
        error.response?.status === 409
          ? "auth.userExists"
          : error.response?.status === 400 || error.response?.status === 403
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
            <Text style={styles.notice}>{t("auth.credentialNotice")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.identifier")}
              accessibilityLabel={t("auth.identifier")}
              placeholderTextColor={colors.mutedText}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              maxLength={254}
              editable={!loading}
            />
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
              placeholder={t("auth.displayName")}
              accessibilityLabel={t("auth.displayName")}
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
              style={[styles.button, (loading || (!invitationCode && bootstrapAvailable === null)) && styles.disabled]}
              disabled={loading || (!invitationCode && bootstrapAvailable === null)}
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
  button: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  link: { color: colors.primary, textAlign: "center", padding: 12 },
});
