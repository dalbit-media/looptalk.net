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
import * as Invitations from "../../api/invitations";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { LanguageFooter } from "../../components/LanguageFooter";
import { showAlert } from "../../utils/showAlert";

export const InvitationScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [code, setCode] = useState(route.params?.code || "");
  const [inviterInfo, setInviterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const normalizedCode = code.trim().toUpperCase();
  const isValidCode = /^[A-Z0-9]{8}$/.test(normalizedCode);

  useEffect(() => {
    if (isValidCode) {
      loadInvitation(normalizedCode);
    }
  }, [normalizedCode]);

  const loadInvitation = async (invitationCode, proceed = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const info = await Invitations.getInvitationInfo(invitationCode);
      if (requestId !== requestIdRef.current) return;
      setInviterInfo(info);
      if (proceed) {
        navigation.navigate("Register", {
          invitationCode,
          inviteeEmail: info.inviteeEmail,
        });
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setInviterInfo(null);
        showAlert(t("common.error"), t("auth.invalidInvitation"));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const handleProceed = () => {
    if (loading) return;
    if (!isValidCode) {
      showAlert(t("common.error"), t("auth.enterValidInvitation"));
      return;
    }
    if (!inviterInfo) {
      loadInvitation(normalizedCode, true);
      return;
    }
    navigation.navigate("Register", {
      invitationCode: normalizedCode,
      inviteeEmail: inviterInfo.inviteeEmail,
    });
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
          <Text style={styles.title}>{t("auth.invitedTitle")}</Text>
          <Text style={styles.subtitle}>
            {t("auth.invitedSubtitle")}
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t("auth.invitationCode")}
            placeholderTextColor={colors.mutedText}
            value={code}
            onChangeText={(value) => {
              requestIdRef.current += 1;
              setInviterInfo(null);
              setCode(value.toUpperCase());
            }}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={handleProceed}
            editable={!loading}
          />

          {inviterInfo && (
            <View style={styles.inviterCard}>
              <View style={styles.inviterAvatar}>
                <Text style={styles.avatarText}>
                  {inviterInfo.inviter.displayName[0]}
                </Text>
              </View>
              <View style={styles.inviterInfo}>
                <Text style={styles.inviterName}>
                  {inviterInfo.inviter.displayName}
                </Text>
                <Text style={styles.inviterUsername}>
                  @{inviterInfo.inviter.username}
                </Text>
                <Text style={styles.inviteeEmail}>{inviterInfo.inviteeEmail}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!isValidCode || loading) && styles.buttonDisabled]}
            onPress={handleProceed}
            disabled={!isValidCode || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.continue")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
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
  inviterCard: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  inviterInfo: {
    flex: 1,
  },
  inviterName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  inviterUsername: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 2,
  },
  inviteeEmail: {
    fontSize: 12,
    color: colors.mutedText,
    marginTop: 4,
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
