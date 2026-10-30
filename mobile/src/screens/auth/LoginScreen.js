import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { AppText as Text } from "../../components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthStore } from "../../store/authStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { BrandMark } from "../../components/BrandMark";
import { InfoTip } from "../../components/InfoTip";
import { SocialAuthButtons } from "../../components/SocialAuthButtons";
import { normalizeIdentifier } from "../../utils/accountPrivacy";

export const LoginScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [legacyMigration, setLegacyMigration] = useState(false);
  const prepareLegacyMigration = useAuthStore((state) => state.prepareLegacyMigration);
  const completeLegacyMigration = useAuthStore((state) => state.completeLegacyMigration);
  const cancelLegacyMigration = useAuthStore((state) => state.cancelLegacyMigration);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const login = useAuthStore((state) => state.login);
  const initializationError = useAuthStore((state) => state.initializationError);

  const handleLogin = async () => {
    if (loading) return;

    if (!identifier.trim() || !password) {
      setErrorMessage(t("auth.fillAllFields"));
      return;
    }

    setErrorMessage("");
    setLoading(true);
    try {
      const normalized = normalizeIdentifier(identifier);
      await login(normalized, password);
      setPassword("");
    } catch (error) {
      if (error.request && !error.response) {
        setErrorMessage(t("auth.serverUnavailable"));
      } else if (error.response?.status === 426) {
        setLegacyMigration(true);
        setErrorMessage(t("auth.legacyMigrationNotice"));
      } else {
        setErrorMessage(t("auth.invalidCredentials"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMigration = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMessage("");
    try {
      await prepareLegacyMigration(normalizeIdentifier(identifier), password);
      await completeLegacyMigration();
      setPassword("");
    } catch {
      await cancelLegacyMigration();
      setErrorMessage(t("auth.legacyMigrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {navigation.canGoBack() && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark size={72} />
          <Text style={styles.title}>{t("brand.name")}</Text>
          <Text style={styles.subtitle}>{t("auth.loginSubtitle")}</Text>
          <InfoTip align="center" text={t("auth.persistentSessionNotice")} style={styles.infoTip} />
        </View>

        <View style={styles.form}>
          {initializationError && !errorMessage && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {t("auth.sessionExpired")}
            </Text>
          )}
          <TextInput
            style={styles.input}
            accessibilityLabel={t("auth.identifier")}
            placeholder={t("auth.identifier")}
            placeholderTextColor={colors.mutedText}
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setLegacyMigration(false);
              setErrorMessage("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            maxLength={254}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            accessibilityLabel={t("auth.password")}
            placeholder={t("auth.password")}
            placeholderTextColor={colors.mutedText}
            value={password}
            onChangeText={(value) => { setPassword(value); setErrorMessage(""); setLegacyMigration(false); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            maxLength={128}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          {errorMessage ? (
            <Text
              accessibilityRole="alert"
              aria-live="assertive"
              style={styles.errorText}
            >
              {errorMessage}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.loginButton")}</Text>
            )}
          </TouchableOpacity>

          {legacyMigration && (
            <TouchableOpacity onPress={handleMigration} disabled={loading}>
              <Text style={styles.link}>{t("auth.migrateAccount")}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>{t("auth.orContinueWith")}</Text>
            <View style={styles.divider} />
          </View>
          <SocialAuthButtons mode="recover" disabled={loading} onError={setErrorMessage} />

          <TouchableOpacity
            onPress={() => navigation.navigate("Register")}
            disabled={loading}
          >
            <Text style={styles.link}>{t("auth.createAccount")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("Invitation")} disabled={loading}>
            <Text style={styles.link}>{t("auth.haveInvite")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.mutedText, fontSize: 12 },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text,
    marginTop: 14,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.secondaryText,
  },
  sessionNotice: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: colors.mutedText,
  },
  infoTip: {
    marginTop: 8,
    alignSelf: "center",
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.input,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.action,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    textAlign: "center",
    color: colors.primary,
    fontSize: 14,
    marginTop: 16,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 16,
    left: 12,
    zIndex: 1,
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
});
