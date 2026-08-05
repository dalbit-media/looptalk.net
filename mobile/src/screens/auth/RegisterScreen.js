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
import { showAlert } from "../../utils/showAlert";
import {
  EMAIL_MAX_LENGTH,
  isValidEmail,
  isValidPhoneNumber,
  PASSWORD_MAX_LENGTH,
} from "../../utils/validation";

export const RegisterScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [contactType, setContactType] = useState("email");
  const [email, setEmail] = useState(route.params?.inviteeEmail || "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(null);
  const invitationCode = route.params?.invitationCode || route.params?.code;
  const contactInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

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
    return () => {
      active = false;
    };
  }, []);

  const handleRegister = async () => {
    if (loading) return;

    const contact = contactType === "email" ? email.trim() : phoneNumber.trim();
    if (!contact || !password || !confirmPassword) {
      showAlert(t("common.error"), t("auth.fillAllFields"));
      return;
    }

    if (contactType === "email" && !isValidEmail(email)) {
      showAlert(t("common.error"), t("auth.invalidEmail"));
      return;
    }

    if (contactType === "phone" && !isValidPhoneNumber(phoneNumber)) {
      showAlert(t("common.error"), t("auth.invalidPhoneNumber"));
      return;
    }

    if (password !== confirmPassword) {
      showAlert(t("common.error"), t("auth.passwordMismatch"));
      return;
    }

    if (password.length < 6) {
      showAlert(t("common.error"), t("auth.passwordLength"));
      return;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      showAlert(t("common.error"), t("auth.passwordTooLong"));
      return;
    }

    if (!invitationCode && bootstrapAvailable === false) {
      showAlert(t("common.error"), t("auth.invitationRequired"));
      return;
    }

    setLoading(true);
    try {
      await register(
        contactType === "email" ? email.trim() : null,
        contactType === "phone" ? phoneNumber.trim() : null,
        password,
        invitationCode
      );
    } catch (error) {
      showAlert(
        t("auth.registrationFailed"),
        t("common.error")
      );
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
          <Text style={styles.title}>{t("auth.createAccount")}</Text>
          <Text style={styles.subtitle}>{t("auth.registerSubtitle")}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.helperText}>{t("auth.usernameAssigned")}</Text>

          <View style={styles.contactSelector}>
            {["email", "phone"].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.contactOption,
                  contactType === type && styles.contactOptionSelected,
                ]}
                onPress={() => setContactType(type)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.contactOptionText,
                    contactType === type && styles.contactOptionTextSelected,
                  ]}
                >
                  {t(type === "email" ? "auth.email" : "auth.phoneNumber")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {contactType === "email" ? (
            <TextInput
              ref={contactInputRef}
              style={styles.input}
              placeholder={t("auth.email")}
              placeholderTextColor={colors.mutedText}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading && !route.params?.inviteeEmail}
            />
          ) : (
            <TextInput
              ref={contactInputRef}
              style={styles.input}
              placeholder={t("auth.phoneNumber")}
              placeholderTextColor={colors.mutedText}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={24}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
          )}

          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder={t("auth.password")}
            placeholderTextColor={colors.mutedText}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
            blurOnSubmit={false}
            editable={!loading}
          />

          <TextInput
            ref={confirmPasswordInputRef}
            style={styles.input}
            placeholder={t("auth.confirmPassword")}
            placeholderTextColor={colors.mutedText}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            returnKeyType="go"
            onSubmitEditing={handleRegister}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.registerButton")}</Text>
            )}
          </TouchableOpacity>

          <SocialAuthButtons
            invitationCode={invitationCode}
            disabled={loading}
          />

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.link}>{t("auth.alreadyHaveAccount")}</Text>
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
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.secondaryText,
  },
  helperText: {
    color: colors.secondaryText,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  contactSelector: {
    flexDirection: "row",
    backgroundColor: colors.input,
    borderRadius: 8,
    padding: 3,
  },
  contactOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 6,
  },
  contactOptionSelected: {
    backgroundColor: colors.primary,
  },
  contactOptionText: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: "600",
  },
  contactOptionTextSelected: {
    color: "#fff",
  },
  form: {
    gap: 12,
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
