import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "../../components/AppText";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { SocialAuthButtons } from "../../components/SocialAuthButtons";
import { useAuthStore } from "../../store/authStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useAppInstall } from "../../hooks/useAppInstall";
import { isUsername, normalizeIdentifier } from "../../utils/accountPrivacy";

// Where invited members replace their generated sign-in, link Google/Apple and install the app.
export const AccountSetupScreen = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const setup = useAuthStore((state) => state.accountSetup);
  const currentUsername = useAuthStore((state) => state.user?.username || "");
  const changeCredentials = useAuthStore((state) => state.changeCredentials);
  const appInstall = useAppInstall();
  const [revealed, setRevealed] = useState(false);
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const [socialError, setSocialError] = useState("");
  const generated = setup?.generated;

  const handleSave = async () => {
    if (saving) return;
    let normalized;
    try {
      normalized = normalizeIdentifier(username);
      if (!isUsername(normalized)) throw new Error("Invalid username");
    } catch {
      setMessage({ text: t("auth.invalidUsername"), error: true });
      return;
    }
    const problem = password.length < 8 ? "auth.passwordLength" : password.length > 128 ? "auth.passwordTooLong"
      : password !== confirmPassword ? "auth.passwordMismatch" : null;
    if (problem) {
      setMessage({ text: t(problem), error: true });
      return;
    }
    setSaving(true);
    setMessage({ text: "", error: false });
    try {
      await changeCredentials(normalized, password);
      setPassword("");
      setConfirmPassword("");
      setMessage({ text: t("setup.saved"), error: false });
    } catch (error) {
      setMessage({
        text: t(error.response?.status === 409 ? "auth.userExists"
          : error.request && !error.response ? "auth.serverUnavailable" : "setup.saveFailed"),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const passwordInput = (value, onChange, label) => (
    <TextInput
      style={styles.input} placeholder={label} accessibilityLabel={label} placeholderTextColor={colors.mutedText}
      value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" autoCorrect={false}
      autoComplete="new-password" textContentType="newPassword" maxLength={128} editable={!saving}
    />
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {generated ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{t("setup.generatedTitle")}</Text>
            <Text style={styles.body}>{t("setup.generatedBody")}</Text>
            <Text style={styles.label}>{t("auth.username")}</Text>
            <Text selectable style={styles.value}>{generated.username}</Text>
            <Text style={styles.label}>{t("auth.password")}</Text>
            <View style={styles.row}>
              <Text selectable style={[styles.value, styles.grow]}>{revealed ? generated.password : "••••-••••-••••-••••"}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setRevealed(!revealed)} hitSlop={8}
                accessibilityLabel={t(revealed ? "setup.hidePassword" : "setup.showPassword")}>
                <Ionicons name={revealed ? "eye-off-outline" : "eye-outline"} size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {setup?.wrapped ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{t("setup.chooseTitle")}</Text>
            <TextInput
              style={styles.input} placeholder={t("auth.username")} accessibilityLabel={t("auth.username")}
              placeholderTextColor={colors.mutedText} value={username}
              onChangeText={(value) => setUsername(value.toLowerCase())}
              autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={30} editable={!saving}
            />
            {passwordInput(password, setPassword, t("auth.password"))}
            {passwordInput(confirmPassword, setConfirmPassword, t("auth.confirmPassword"))}
            <Text style={styles.body}>{t("auth.credentialNotice")}</Text>
            {message.text ? (
              <Text accessibilityRole="alert" style={message.error ? styles.error : styles.success}>{message.text}</Text>
            ) : null}
            <TouchableOpacity accessibilityRole="button" style={[styles.button, saving && styles.disabled]}
              disabled={saving} onPress={handleSave}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("setup.save")}</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.heading}>{t("setup.signInTitle")}</Text>
            {currentUsername ? (
              <>
                <Text style={styles.label}>{t("auth.username")}</Text>
                <Text selectable style={styles.value}>@{currentUsername}</Text>
              </>
            ) : null}
            <Text style={styles.body}>{t("setup.signInFixed")}</Text>
          </View>
        )}

        <SocialAuthButtons mode="link" title={t("setup.linkTitle")} onError={setSocialError} style={styles.card} />
        {socialError ? <Text accessibilityRole="alert" style={styles.error}>{socialError}</Text> : null}

        {appInstall.available ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{appInstall.label}</Text>
            <Text style={styles.body}>{appInstall.hint}</Text>
            <TouchableOpacity accessibilityRole="button" style={[styles.button, appInstall.installing && styles.disabled]}
              disabled={appInstall.installing} onPress={appInstall.install}>
              <Text style={styles.buttonText}>{t("setup.install")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 20, gap: 16, width: "100%", maxWidth: 560, alignSelf: "center" },
  card: { gap: 10, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input },
  heading: { fontSize: 16, fontWeight: "700", color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.secondaryText },
  label: { fontSize: 12, color: colors.mutedText },
  value: { fontSize: 16, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: colors.primary, fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: colors.action, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
});
