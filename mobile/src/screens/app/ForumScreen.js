import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "../../components/AppText";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { InfoTip } from "../../components/InfoTip";
import { GuestJoinBanner } from "../../components/GuestJoinBanner";
import { useAuthStore } from "../../store/authStore";
import { useContactStore } from "../../store/contactStore";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import * as ForumAPI from "../../api/forum";

const Button = ({ label, onPress, disabled, styles, secondary }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }}
    onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
  </TouchableOpacity>
);

const VISIBILITY_LABELS = { contacts: "forum.visibilityContacts", network: "forum.visibilityNetwork", public: "forum.visibilityPublic" };
const TAB_LABELS = { contacts: "forum.myContacts", network: "forum.network", public: "forum.public" };
const VISIBILITY_ICONS = { contacts: "people-outline", network: "git-network-outline", public: "globe-outline" };

const TabLabel = ({ visibility, label, selected, styles, color }) => (
  <View style={styles.tabLabel}>
    <Ionicons name={VISIBILITY_ICONS[visibility]} size={20} color={color} />
    <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
  </View>
);

export const ForumScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const myId = useAuthStore((state) => state.user?.id);
  const contacts = useContactStore((state) => state.contacts);
  const isMember = useAuthStore((state) => state.user?.member !== false);
  const [selectedTab, setTab] = useState("contacts");
  const tab = isMember ? selectedTab : "public";
  const [polls, setPolls] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (nextPage = 1) => {
    const current = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const data = await ForumAPI.listPolls(token, nextPage, tab === "contacts" ? "loop" : tab);
      if (current !== request.current) return;
      setPolls((previous) => nextPage === 1 ? data.polls :
        [...previous, ...data.polls.filter((poll) => !previous.some((item) => item.id === poll.id))]);
      setPage(nextPage);
      setHasMore(data.hasMore);
    } catch {
      if (current === request.current) setError(true);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [token, tab]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { request.current += 1; };
  }, [load]));

  const contactIds = new Set(Object.values(contacts).flat().map((contact) => contact.contactUserId));
  const visiblePolls = tab === "contacts"
    ? polls.filter((poll) => poll.author.id === myId || contactIds.has(poll.author.id))
    : polls.filter((poll) => poll.visibility === tab);
  const canLoadMore = hasMore && (tab !== "contacts" || contactIds.size > 0);
  const emptyKey = tab === "network" ? "forum.networkEmpty" : tab === "public" ? "forum.empty" :
    contactIds.size === 0 ? "forum.noContacts" : hasMore ? "forum.noContactsLoaded" : "forum.contactsEmpty";

  return (
    <View style={styles.screen}>
    <FlatList style={styles.screen} contentContainerStyle={styles.fabContent}
      data={visiblePolls} keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      ListHeaderComponent={<View style={styles.section}>
        <GuestJoinBanner onPress={() => navigation.navigate("JoinNetwork")} />
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(isMember ? ["contacts", "network", "public"] : ["public"]).map((key) => (
            <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}
              onPress={() => { if (tab !== key) { setPolls([]); setHasMore(false); setTab(key); } }}
              style={[styles.tab, tab === key && styles.tabSelected]}>
              <TabLabel visibility={key} label={t(TAB_LABELS[key])} selected={tab === key} styles={styles}
                color={tab === key ? colors.navigationAccent : colors.secondaryText} />
            </TouchableOpacity>
          ))}
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{t("forum.loadFailed")}</Text>}
        {error && <Button secondary styles={styles} disabled={loading} label={t("forum.retry")} onPress={() => load()} />}
      </View>}
      ListEmptyComponent={!loading && !error ? <Text style={styles.notice}>{t(emptyKey)}</Text> : null}
      ListFooterComponent={canLoadMore ? <Button secondary styles={styles} disabled={loading}
        label={t("forum.loadMore")} onPress={() => load(page + 1)} /> : null}
      renderItem={({ item }) => (
        <TouchableOpacity accessibilityRole="button" style={styles.card}
          onPress={() => navigation.navigate("Poll", { pollId: item.id })}>
          <Text style={styles.title}>{item.question}</Text>
          <Text style={styles.meta}>{item.author.name} · {new Date(item.createdAt).toLocaleDateString()}{item.visibility !== "public" ? ` · ${t(VISIBILITY_LABELS[item.visibility] || VISIBILITY_LABELS.contacts)}` : ""}</Text>
          {item.myOptionId ? <Text style={styles.meta}>{t("forum.participated")}</Text> : null}
        </TouchableOpacity>
      )}
    />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("forum.create")} style={styles.fab}
      onPress={() => navigation.navigate("CreatePoll")}>
      <Ionicons name="add" size={28} color={colors.onAction} />
    </TouchableOpacity>
    </View>
  );
};

export const CreatePollScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [custom, setCustom] = useState(false);
  const isMember = useAuthStore((state) => state.user?.member !== false);
  const [selectedVisibility, setVisibility] = useState("contacts");
  const visibility = isMember ? selectedVisibility : "public";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    const trimmed = custom ? options.map((option) => option.trim()) : [t("forum.support")];
    if (!question.trim() || question.trim().length > 300 || trimmed.some((option) => !option || option.length > 120) ||
        new Set(trimmed.map((option) => option.toLowerCase())).size !== trimmed.length ||
        (custom && trimmed.length < 2)) {
      setError(t("forum.invalidPoll"));
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const poll = await ForumAPI.createPoll(token, question.trim(), trimmed, visibility);
      navigation.replace("Poll", { pollId: poll.id });
    } catch {
      setError(t("forum.createFailed"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("forum.question")}</Text>
        <TextInput style={styles.input} accessibilityLabel={t("forum.question")} value={question}
          onChangeText={setQuestion} maxLength={300} multiline editable={!saving} />
        {custom ? <>
          {options.map((option, index) => (
            <View key={index} style={styles.section}>
              <Text style={styles.body}>{t("forum.option", { number: index + 1 })}</Text>
              <TextInput style={styles.input} accessibilityLabel={t("forum.option", { number: index + 1 })}
                value={option} maxLength={120} editable={!saving}
                onChangeText={(value) => setOptions((previous) => previous.map((text, i) => i === index ? value : text))} />
              {options.length > 2 && <Button secondary styles={styles} disabled={saving}
                label={t("forum.removeOption", { number: index + 1 })}
                onPress={() => setOptions((previous) => previous.filter((_, i) => i !== index))} />}
            </View>
          ))}
          {options.length < 10 && <Button secondary styles={styles} disabled={saving} label={t("forum.addOption")}
            onPress={() => setOptions((previous) => [...previous, ""])} />}
          <Button secondary styles={styles} disabled={saving} label={t("forum.supportOnly")} onPress={() => setCustom(false)} />
        </> : <>
          <View style={styles.card}>
            <Text style={styles.body}>{`👍 ${t("forum.support")}`}</Text>
            <Text style={styles.meta}>{t("forum.supportHint")}</Text>
          </View>
          <Button secondary styles={styles} disabled={saving} label={t("forum.customChoices")} onPress={() => setCustom(true)} />
        </>}
        <View accessibilityRole="radiogroup" style={styles.visibility}>
          {(isMember ? ["contacts", "network", "public"] : ["public"]).map((key) => (
            <TouchableOpacity key={key} accessibilityRole="radio" accessibilityState={{ checked: visibility === key, disabled: saving }}
              disabled={saving} onPress={() => setVisibility(key)}
              style={[styles.visibilityOption, visibility === key && styles.tabSelected]}>
              <TabLabel visibility={key} label={t(VISIBILITY_LABELS[key])} selected={visibility === key} styles={styles}
                color={visibility === key ? colors.navigationAccent : colors.secondaryText} />
            </TouchableOpacity>
          ))}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button styles={styles} disabled={saving} label={t("forum.create")} onPress={submit} />
        {saving && <ActivityIndicator color={colors.primary} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export const PollScreen = ({ route }) => {
  const { pollId } = route.params;
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const myId = useAuthStore((state) => state.user?.id);
  const isMember = useAuthStore((state) => state.user?.member !== false);
  const [poll, setPoll] = useState(null);
  const [comments, setComments] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selection, setSelection] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const detail = await ForumAPI.getPoll(token, pollId);
      if (current !== request.current) return;
      setPoll(detail);
      if (detail.myOptionId) {
        const data = await ForumAPI.listComments(token, pollId);
        if (current !== request.current) return;
        setComments(data.comments);
        setPage(1);
        setHasMore(data.hasMore);
      } else {
        setComments([]);
        setHasMore(false);
      }
    } catch {
      if (current === request.current) setError(t("forum.loadFailed"));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [token, pollId, t]);

  useFocusEffect(useCallback(() => {
    setPoll(null);
    setComments([]);
    setSelection(null);
    setComment("");
    load();
    return () => { request.current += 1; };
  }, [load]));

  const submitVote = async (optionId) => {
    const target = typeof optionId === "string" ? optionId : selection;
    if (!target || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await ForumAPI.vote(token, pollId, target);
      setPoll((previous) => ({ ...previous, myOptionId: result.myOptionId }));
      await load();
    } catch (failure) {
      if (failure.response?.status === 409) await load();
      else setError(t("forum.voteFailed"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const submitVisibility = async (next) => {
    if (submitting.current || !poll || next === poll.visibility) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await ForumAPI.setPollVisibility(token, pollId, next);
      setPoll((previous) => ({ ...previous, visibility: result.visibility }));
    } catch {
      setError(t("forum.visibilityFailed"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const submitComment = async () => {
    if (!comment.trim() || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await ForumAPI.postComment(token, pollId, comment.trim());
      setComment("");
      await load();
    } catch {
      setError(t("forum.commentFailed"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const moreComments = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    const current = request.current;
    try {
      const data = await ForumAPI.listComments(token, pollId, page + 1);
      if (current !== request.current) return;
      setComments((previous) => [...previous, ...data.comments.filter((item) => !previous.some((old) => old.id === item.id))]);
      setPage((previous) => previous + 1);
      setHasMore(data.hasMore);
    } catch {
      if (current === request.current) setError(t("forum.loadFailed"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} enabled={!saving} />}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {error ? <View style={styles.section}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Button secondary styles={styles} disabled={loading || saving} label={t("forum.retry")} onPress={load} />
        </View> : null}
        {poll && <>
          <View style={styles.titleRow}>
            <Text style={[styles.title, styles.grow]}>{poll.question}</Text>
            <InfoTip align="right" text={t("forum.rules")} />
          </View>
          <Text style={styles.meta}>{poll.author.name} · {new Date(poll.createdAt).toLocaleString()}</Text>
          {poll.author.id === myId && isMember ? <View accessibilityRole="radiogroup" style={styles.visibility}>
            {["contacts", "network", "public"].map((key) => (
              <TouchableOpacity key={key} accessibilityRole="radio" accessibilityState={{ checked: poll.visibility === key, disabled: saving || loading }}
                disabled={saving || loading} onPress={() => submitVisibility(key)}
                style={[styles.visibilityOption, poll.visibility === key && styles.tabSelected]}>
                <TabLabel visibility={key} label={t(VISIBILITY_LABELS[key])} selected={poll.visibility === key} styles={styles}
                  color={poll.visibility === key ? colors.navigationAccent : colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View> : <Text style={styles.meta}>{t(VISIBILITY_LABELS[poll.visibility] || VISIBILITY_LABELS.contacts)}</Text>}
          {poll.options.length === 1 && !poll.myOptionId ? null : poll.options.map((option) => {
            const count = poll.results?.find((result) => result.optionId === option.id)?.votes;
            const percent = poll.totalVotes ? Math.round(count / poll.totalVotes * 100) : 0;
            return poll.myOptionId ? (
              <View key={option.id} style={[styles.card, poll.myOptionId === option.id && styles.selected]}>
                <Text style={styles.body}>{option.text}{poll.myOptionId === option.id ? ` (${t("forum.yourVote")})` : ""}</Text>
                {count !== undefined && <>
                  <Text style={styles.meta}>{t("forum.result", { count, percent })}</Text>
                  <View style={styles.track}><View style={[styles.bar, { width: `${percent}%` }]} /></View>
                </>}
              </View>
            ) : (
              <TouchableOpacity key={option.id} accessibilityRole="radio"
                accessibilityState={{ checked: selection === option.id, disabled: saving || loading }}
                disabled={!isMember || saving || loading} onPress={() => setSelection(option.id)}
                style={[styles.card, selection === option.id && styles.selected]}>
                <Text style={styles.body}>{option.text}</Text>
              </TouchableOpacity>
            );
          })}
          {!isMember ? <Text style={styles.notice}>{t("forum.guestNotice")}</Text> : !poll.myOptionId ? <View style={styles.section}>
            <Text style={styles.notice}>{t("forum.voteToUnlock")}</Text>
            {poll.options.length === 1
              ? <Button styles={styles} disabled={saving || loading} label={`👍 ${poll.options[0].text}`}
                onPress={() => submitVote(poll.options[0].id)} />
              : <Button styles={styles} disabled={!selection || saving || loading} label={t("forum.vote")} onPress={submitVote} />}
          </View> : <>
            {poll.results && <Text style={styles.notice}>{t("forum.totalVotes", { count: poll.totalVotes })}</Text>}
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("forum.comments")}</Text>
              <InfoTip align="right" text={t("forum.storageNotice")} />
            </View>
            <TextInput style={styles.input} accessibilityLabel={t("forum.commentPlaceholder")}
              placeholder={t("forum.commentPlaceholder")} value={comment} onChangeText={setComment}
              multiline maxLength={2000} editable={!saving} />
            <Button styles={styles} label={t("forum.postComment")} onPress={submitComment}
              disabled={!comment.trim() || saving || loading} />
            {!loading && !error && comments.length === 0 && <Text style={styles.notice}>{t("forum.noComments")}</Text>}
            {comments.map((item) => <View key={item.id} style={styles.card}>
              <Text style={styles.meta}>{item.author.name} · {new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.body}>{item.content}</Text>
            </View>)}
            {hasMore && <Button secondary styles={styles} disabled={saving || loading} label={t("forum.loadMore")} onPress={moreComments} />}
          </>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12, width: "100%", maxWidth: 800, alignSelf: "center", flexGrow: 1 },
  section: { gap: 10, marginBottom: 12 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 },
  tabSelected: { borderBottomColor: colors.navigationAccent },
  tabLabel: { alignItems: "center", gap: 2 },
  tabText: { color: colors.secondaryText, fontWeight: "600", fontSize: 13, textAlign: "center" },
  tabTextSelected: { color: colors.navigationAccent },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, zIndex: 1000 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, zIndex: 1000 },
  grow: { flex: 1 },
  visibility: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  visibilityOption: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 },
  title: { color: colors.text, fontSize: 20, fontWeight: "600" },
  body: { color: colors.text },
  meta: { color: colors.secondaryText, fontSize: 13 },
  notice: { color: colors.secondaryText, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 8, marginBottom: 12 },
  selected: { borderColor: colors.navigationAccent, backgroundColor: colors.primarySoft },
  input: { color: colors.text, backgroundColor: colors.input, borderRadius: 8, padding: 12, minHeight: 48 },
  button: { borderRadius: 8, padding: 12, minHeight: 44, alignItems: "center", backgroundColor: colors.action, marginVertical: 4 },
  buttonText: { color: colors.onAction, fontWeight: "600" },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  buttonSecondaryText: { color: colors.text },
  fabContent: { padding: 16, gap: 12, paddingBottom: 96, width: "100%", maxWidth: 800, alignSelf: "center", flexGrow: 1 },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.action, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 5 },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger },
  track: { height: 8, backgroundColor: colors.input, borderRadius: 4, overflow: "hidden" },
  bar: { height: 8, backgroundColor: colors.navigationAccent },
});
