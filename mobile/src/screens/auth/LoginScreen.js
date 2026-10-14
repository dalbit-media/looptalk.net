import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useAuthStore } from "../../store/authStore";
import * as AuthAPI from "../../api/auth";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { SocialAuthButtons } from "../../components/SocialAuthButtons";
import { LanguageFooter } from "../../components/LanguageFooter";
import { BrandMark } from "../../components/BrandMark";

export const LoginScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const passwordInputRef = useRef(null);

  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    AuthAPI.getBootstrapStatus()
      .then(({ bootstrapAvailable: available }) => setBootstrapAvailable(available))
      .catch(() => setBootstrapAvailable(false));
  }, []);

  const handleLogin = async () => {
    if (loading) return;

    if (!identifier.trim() || !password) {
      setErrorMessage(t("auth.fillAllFields"));
      return;
    }

    setErrorMessage("");
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (error) {
      if (!error.response) {
        setErrorMessage(t("auth.serverUnavailable"));
      } else if (error.response.status === 401) {
        setErrorMessage(t("auth.invalidCredentials"));
      } else {
        setErrorMessage(error.response.data?.error || t("common.error"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark size={72} />
          <Text style={styles.title}>{t("brand.name")}</Text>
          <Text style={styles.subtitle}>{t("auth.loginSubtitle")}</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t("auth.identifier")}
            placeholderTextColor={colors.mutedText}
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setErrorMessage("");
            }}
            keyboardType="default"
            autoCapitalize="none"
            autoComplete="username"
            maxLength={254}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            blurOnSubmit={false}
            editable={!loading}
          />

          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder={t("auth.password")}
            placeholderTextColor={colors.mutedText}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setErrorMessage("");
            }}
            secureTextEntry
            autoComplete="current-password"
            maxLength={128}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!loading}
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

          <SocialAuthButtons disabled={loading} />

          <TouchableOpacity
            onPress={() => navigation.navigate(
              bootstrapAvailable ? "Register" : "Invitation",
              bootstrapAvailable ? { isBootstrap: true } : undefined
            )}
            disabled={loading}
          >
            <Text style={styles.link}>
              {bootstrapAvailable
                ? t("auth.createFirstAccount")
                : t("auth.getInvite")}
            </Text>
          </TouchableOpacity>
        </View>
        <LanguageFooter />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.primary,
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
});
