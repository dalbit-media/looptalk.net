import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Modal, RefreshControl, ScrollView,
  StyleSheet, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { cloudProviderMarks } from "../../../../public/site/cloud-providers";
import { AppText as Text } from "../../components/AppText";
import { AppTextInput as TextInput } from "../../components/AppTextInput";
import { SearchBar } from "../../components/SearchBar";
import { VideoMessageBubble } from "../../components/VideoMessageBubble";
import { VoiceMessageBubble } from "../../components/VoiceMessageBubble";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuthStore } from "../../store/authStore";
import {
  CLOUD_PROVIDERS, DATA_TYPES, filterDataLibrary, loadDataLibrary,
  normalizeDataTags, saveDataTags, summarizeDataLibrary,
} from "../../utils/dataLibrary";
import { openPrivateAttachment, privateMediaUrl } from "../../utils/privateMedia";
import { showAlert } from "../../utils/showAlert";

const localUrl = (url) => typeof url === "string" && /^(blob:|data:|file:|content:)/.test(url);

function LocalMedia({ entry, userId, thumbnail = false, styles, colors, t }) {
  const [uri, setUri] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    const message = entry.message;
    const id = thumbnail && entry.category === "video" ? message.localThumbnailId : message.localMediaId;
    const mimeType = thumbnail && entry.category === "video" ? message.thumbnailMimeType : message.mediaMimeType;
    const fallback = thumbnail && entry.category === "video" ? message.thumbnailUrl : message.mediaUrl;
    (async () => {
      try {
        const url = id ? await privateMediaUrl(userId, id, mimeType) : localUrl(fallback) ? fallback : null;
        if (!active || useAuthStore.getState().user?.id !== userId) return;
        if (!url) {
          setFailed(true);
          return;
        }
        setUri(url);
      } catch (error) {
        console.error("Unable to read local data media:", error);
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, [entry, userId, thumbnail]);
  if (failed) return <Text style={styles.muted}>{t(thumbnail ? "myData.noPreview" : "myData.unavailable")}</Text>;
  if (!uri) return <ActivityIndicator color={colors.primary} />;
  if (!thumbnail && entry.category === "video") return <VideoMessageBubble uri={uri} />;
  if (!thumbnail && entry.category === "audio") {
    return <VoiceMessageBubble uri={uri} duration={entry.message.duration} isOwn={false} />;
  }
  return (
    <Image
      source={{ uri }}
      style={thumbnail ? styles.thumbnail : styles.fullImage}
      resizeMode={thumbnail ? "cover" : "contain"}
      accessibilityLabel={entry.message.fileName || t(`myData.type.${entry.category}`)}
      onError={() => setFailed(true)}
    />
  );
}

export const MyDataScreen = ({ navigation, route }) => {
  const t = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = useAuthStore((state) => state.user?.id);
  const browsing = route.name === "DataCategory";
  const category = route.params?.category || null;
  const selectedTag = route.params?.tag || "";
  const [entries, setEntries] = useState([]);
  const [tags, setTags] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagError, setTagError] = useState("");
  const refresh = () => setRevision((value) => value + 1);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setSelected(null);
    setEntries([]);
    setTags({});
    (async () => {
      try {
        const library = await loadDataLibrary(userId);
        if (!active || useAuthStore.getState().user?.id !== userId) return;
        setEntries(library.entries);
        setTags(library.tags);
      } catch (cause) {
        console.error("Unable to load My Data:", cause);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId, revision]));

  const summary = useMemo(() => summarizeDataLibrary(entries), [entries]);
  const visible = useMemo(
    () => filterDataLibrary(entries, tags, category, query, selectedTag),
    [entries, tags, category, query, selectedTag]
  );
  const libraryTags = [...new Set(entries.flatMap((entry) => tags[entry.key] || []))].sort();
  const maxCount = Math.max(1, ...summary.map((type) => type.count));
  const gallery = category === "image" || category === "video";
  const title = category ? t(`myData.type.${category}`) : t("myData.all");

  const selectEntry = (entry) => {
    setTagInput((tags[entry.key] || []).join(", "));
    setTagError("");
    setSelected(entry);
  };
  const saveTags = async () => {
    let normalized;
    try {
      normalized = normalizeDataTags(tagInput);
    } catch {
      setTagError(t("myData.invalidTags"));
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDataTags(userId, selected.key, normalized);
      if (useAuthStore.getState().user?.id !== userId) return;
      setTags((current) => ({ ...current, [selected.key]: saved }));
      setSelected(null);
    } catch (cause) {
      console.error("Unable to save local data tags:", cause);
      setTagError(t("myData.saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  const openFile = async () => {
    try {
      const message = selected.message;
      const uri = message.localMediaId
        ? await privateMediaUrl(userId, message.localMediaId, message.mediaMimeType)
        : localUrl(message.mediaUrl) ? message.mediaUrl : null;
      if (useAuthStore.getState().user?.id !== userId) return;
      if (!uri) throw new Error("The attachment is not stored on this device");
      await openPrivateAttachment({ ...message, mediaUrl: uri });
    } catch (cause) {
      console.error("Unable to open local data file:", cause);
      showAlert(t("common.error"), t("myData.unavailable"));
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>{t("common.loading")}</Text></View>;
  if (error) return (
    <View style={styles.center}>
      <Text style={styles.muted} accessibilityRole="alert">{t("myData.loadFailed")}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.buttonText}>{t("myData.refresh")}</Text></TouchableOpacity>
    </View>
  );

  const dashboard = (
    <View style={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>{t("myData.onDevice")}</Text>
          <Text style={styles.title}>{t("myData.title")}</Text>
        </View>
        <TouchableOpacity onPress={refresh} accessibilityRole="button" accessibilityLabel={t("myData.refresh")} style={styles.iconButton}>
          <Ionicons name="refresh-outline" size={22} color={colors.navigationAccent} />
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>{t("myData.scope")}</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("myData.itemCount", { count: entries.length })}</Text>
        <Text style={styles.muted}>{t("myData.histogramHint")}</Text>
        <View style={styles.histogram}>
          {summary.map((type) => {
            const blocks = type.count ? Math.max(1, Math.ceil(type.count / maxCount * 10)) : 0;
            return (
              <TouchableOpacity
                key={type.key}
                style={styles.barColumn}
                accessibilityRole="button"
                accessibilityLabel={`${t(`myData.type.${type.key}`)}, ${t("myData.itemCount", { count: type.count })}`}
                onPress={() => navigation.navigate("DataCategory", { category: type.key })}
              >
                <Text style={styles.count}>{type.count}</Text>
                <View style={styles.blocks}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <View key={index} style={[styles.block, { backgroundColor: index >= 10 - blocks ? type.color : colors.input }]} />
                  ))}
                </View>
                <Ionicons name={type.icon} size={18} color={colors.navigationAccent} />
                <Text style={styles.barLabel}>{t(`myData.type.${type.key}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.allButton} onPress={() => navigation.navigate("DataCategory", { category: null })}>
          <Text style={styles.link}>{t("myData.browseAll")}</Text><Ionicons name="arrow-forward" size={18} color={colors.navigationAccent} />
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>{t("myData.tags")}</Text>
      <Text style={styles.muted}>{t("myData.tagsHint")}</Text>
      <View style={styles.tagRow}>
        {libraryTags.map((tag) => (
          <TouchableOpacity key={tag} style={styles.tag} accessibilityRole="button" onPress={() => navigation.navigate("DataCategory", { category: null, tag })}>
            <Text style={styles.link}>#{tag}</Text>
          </TouchableOpacity>
        ))}
        {!libraryTags.length && <Text style={styles.muted}>{t("myData.noTags")}</Text>}
      </View>
      <View style={styles.cloudHeading}><Text style={styles.sectionTitle}>{t("myData.cloudTitle")}</Text><Text style={styles.badge}>{t("myData.preview")}</Text></View>
      <Text style={styles.muted}>{t("myData.cloudBody")}</Text>
      <View style={styles.providers}>
        {CLOUD_PROVIDERS.map((provider) => (
          <View style={styles.provider} key={provider}>
            <MaterialCommunityIcons
              name={cloudProviderMarks[provider].icon}
              size={28}
              color={isDark ? "#B5B5B5" : "#686868"}
              accessible={false}
            />
            <View style={styles.flex}><Text style={styles.providerName}>{provider}</Text><Text style={styles.muted}>{t("myData.notConnected")}</Text></View>
            <Ionicons name="lock-closed-outline" size={16} color={colors.mutedText} />
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>{t("myData.cloudNote")}</Text>
      <View style={styles.card} testID="personal-nas-preview">
        <View style={styles.headingRow}>
          <Ionicons name="server-outline" size={26} color={colors.navigationAccent} />
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("myData.nasTitle")}</Text>
            <Text style={styles.link}>{t("myData.nasStatus")}</Text>
          </View>
          <Ionicons name="lock-closed-outline" size={16} color={colors.mutedText} />
        </View>
        <Text style={styles.muted}>{t("myData.nasBody")}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {browsing ? (
        <FlatList
          key={gallery ? "gallery" : "list"}
          data={visible}
          keyExtractor={(entry) => entry.key}
          numColumns={gallery ? 2 : 1}
          contentContainerStyle={styles.content}
          columnWrapperStyle={gallery ? styles.galleryRow : undefined}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
          ListHeaderComponent={<View style={styles.listHeading}>
            <Text style={styles.title}>{selectedTag ? `#${selectedTag}` : title}</Text>
            <Text style={styles.muted}>{t("myData.itemCount", { count: visible.length })}</Text>
            <SearchBar value={query} onChangeText={setQuery} placeholder={t("myData.search")} colors={colors} />
          </View>}
          ListEmptyComponent={<Text style={styles.empty}>{t(entries.length ? "myData.noResults" : "myData.empty")}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity accessibilityRole="button" onPress={() => selectEntry(item)} style={gallery ? styles.galleryItem : styles.listItem}>
              {gallery ? <View style={styles.thumbnailFrame}><LocalMedia entry={item} userId={userId} thumbnail styles={styles} colors={colors} t={t} /></View> : (
                <Ionicons name={DATA_TYPES.find((type) => type.key === item.category).icon} size={24} color={colors.navigationAccent} />
              )}
              <View style={styles.flex}>
                <Text numberOfLines={gallery ? 1 : 3} style={styles.itemTitle}>{item.message.fileName || item.message.content || t(`myData.type.${item.category}`)}</Text>
                <Text style={styles.footnote}>{Number.isFinite(Date.parse(item.message.createdAt)) ? new Date(item.message.createdAt).toLocaleDateString() : ""}</Text>
                {(tags[item.key] || []).length > 0 && <Text numberOfLines={2} style={styles.link}>{tags[item.key].map((tag) => `#${tag}`).join(" ")}</Text>}
              </View>
              {!gallery && <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />}
            </TouchableOpacity>
          )}
        />
      ) : <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}>{dashboard}</ScrollView>}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { if (!saving) setSelected(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>{selected?.message.fileName || t("myData.details")}</Text>
              {selected?.category === "text" && <Text selectable style={styles.message}>{selected.message.content}</Text>}
              {selected && ["image", "video", "audio"].includes(selected.category) && <LocalMedia entry={selected} userId={userId} styles={styles} colors={colors} t={t} />}
              {selected?.category === "file" && <TouchableOpacity accessibilityRole="button" style={styles.allButton} onPress={openFile}><Text style={styles.link}>{t("myData.openFile")}</Text><Ionicons name="open-outline" size={20} color={colors.navigationAccent} /></TouchableOpacity>}
              <Text style={styles.sectionTitle}>{t("myData.tags")}</Text>
              <Text style={styles.muted}>{t("myData.tagInputHint")}</Text>
              <TextInput value={tagInput} onChangeText={setTagInput} editable={!saving} maxLength={400} style={styles.tagInput} accessibilityLabel={t("myData.tags")} placeholder={t("myData.tagPlaceholder")} placeholderTextColor={colors.mutedText} />
              {!!tagError && <Text style={styles.error} accessibilityRole="alert">{tagError}</Text>}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} disabled={saving} onPress={() => setSelected(null)}><Text style={styles.link}>{t("common.cancel")}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.button} disabled={saving} onPress={saveTags}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("common.save")}</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 18, paddingBottom: 32 },
  center: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: { color: colors.navigationAccent, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" },
  muted: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 8 },
  card: { borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 18, gap: 8 },
  iconButton: { padding: 12, minHeight: 44, minWidth: 44 },
  histogram: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 16 },
  barColumn: { flex: 1, minWidth: 0, alignItems: "center", gap: 8, paddingVertical: 8 },
  count: { color: colors.text, fontSize: 15, fontWeight: "700" },
  blocks: { alignSelf: "stretch", gap: 3 },
  block: { height: 9, borderRadius: 2 },
  barLabel: { color: colors.text, fontSize: 11, textAlign: "center" },
  allButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 14, minHeight: 44 },
  link: { color: colors.navigationAccent, fontSize: 13, fontWeight: "600" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22, backgroundColor: colors.primarySoft },
  cloudHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 },
  badge: { color: colors.navigationAccent, backgroundColor: colors.primarySoft, padding: 6, borderRadius: 6, fontSize: 11 },
  providers: { gap: 10 },
  provider: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  providerName: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  footnote: { color: colors.mutedText, fontSize: 11, lineHeight: 17 },
  listHeading: { gap: 14, marginBottom: 20 },
  galleryRow: { gap: 12 },
  galleryItem: { flex: 1, maxWidth: "50%", minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10, gap: 10, marginBottom: 12 },
  thumbnailFrame: { aspectRatio: 1, backgroundColor: colors.input, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumbnail: { width: "100%", height: "100%" },
  fullImage: { width: "100%", height: 240, marginVertical: 16 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemTitle: { color: colors.text, fontSize: 14, lineHeight: 21 },
  empty: { color: colors.secondaryText, fontSize: 14, lineHeight: 22, paddingVertical: 32, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 560, maxHeight: "90%", backgroundColor: colors.surface, borderRadius: 18, padding: 20, gap: 20 },
  message: { color: colors.text, fontSize: 15, lineHeight: 24, marginBottom: 24 },
  tagInput: { color: colors.text, backgroundColor: colors.input, padding: 12, minHeight: 48, borderRadius: 8, marginTop: 12 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 8 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  cancelButton: { padding: 12, minHeight: 44, justifyContent: "center" },
  button: { backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 12, minHeight: 44, borderRadius: 9, justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
