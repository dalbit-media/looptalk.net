import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { useAuthStore } from "../../store/authStore";
import * as Invitations from "../../api/invitations";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { normalizeInvitationCode, validInvitationCode } from "../../utils/invitationCode";

export const JoinNetworkScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const isMember = useAuthStore((state) => state.user?.member !== false);
  const joinNetwork = useAuthStore((state) => state.joinNetwork);
  const [code, setCode] = useState(route.params?.code || "");
  const [inviter, setInviter] = useState(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const normalized = normalizeInvitationCode(code);
  const valid = validInvitationCode(normalized);

  useEffect(() => {
    const current = ++request.current;
    setInviter(null);
    setLookupFailed(false);
    if (!valid) return;
    Invitations.getInvitationInfo(normalized).then((info) => {
      if (current !== request.current) return;
      if (info.status !== "PENDING") setLookupFailed(true);
      else setInviter(info.inviter || { displayName: "LoopTalk", username: "looptalk" });
    }).catch(() => {
      if (current === request.current) setLookupFailed(true);
    });
  }, [normalized, valid]);

  const handleJoin = async () => {
    if (joining || !valid) return;
    setError("");
    setJoining(true);
    try {
      await joinNetwork(normalized);
      navigation.goBack();
    } catch (failure) {
      const status = failure.response?.status;
      setError(t(
        status === 409 ? "join.alreadyMember"
          : status === 400 ? "auth.invalidInvitation"
          : failure.request && !failure.response ? "auth.serverUnavailable" : "join.failed"
      ));
    } finally {
      setJoining(false);
    }
  };

  if (isMember) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{t("join.alreadyMember")}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>{t("common.ok")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("join.title")}</Text>
        <Text style={styles.subtitle}>{t("join.subtitle")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("auth.invitationCode")}
          accessibilityLabel={t("auth.invitationCode")}
          placeholderTextColor={colors.mutedText}
          value={code}
          onChangeText={(value) => { setError(""); setCode(value.toUpperCase()); }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={64}
          editable={!joining}
          returnKeyType="go"
          onSubmitEditing={handleJoin}
        />
        {inviter ? (
          <View style={styles.inviterCard}>
            <Text style={styles.inviterName}>{inviter.displayName} ({inviter.username})</Text>
            <Text style={styles.subtitle}>{t("join.willJoin")}</Text>
          </View>
        ) : null}
        {lookupFailed || error ? (
          <Text accessibilityRole="alert" style={styles.error}>{error || t("auth.invalidInvitation")}</Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.button, (!valid || joining || lookupFailed) && styles.disabled]}
          disabled={!valid || joining || lookupFailed}
          onPress={handleJoin}
        >
          {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("join.button")}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 16, width: "100%", maxWidth: 560, alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.secondaryText },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, backgroundColor: colors.input },
  inviterCard: { gap: 4, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft },
  inviterName: { fontSize: 16, fontWeight: "600", color: colors.text },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: colors.action, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
});
