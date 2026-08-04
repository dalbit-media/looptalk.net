import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import * as InvitationsAPI from "../../api/invitations";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuthStore } from "../../store/authStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import { copyText } from "../../utils/clipboard";
import { showAlert } from "../../utils/showAlert";

const STATUS_ICONS = {
  CREATED: "time-outline",
  USED: "checkmark-circle-outline",
  EXPIRED: "close-circle-outline",
};

const FILTERS = ["all", "accepted", "connections", "recent"];

const filterInvitations = (invitations, filter) => {
  if (filter === "all") return invitations;
  const accepted = invitations.filter((invitation) => invitation.status === "USED");
  if (filter !== "recent") return accepted;
  const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return accepted.filter((invitation) => (
    new Date(invitation.createdAt).getTime() >= recentThreshold
  ));
};

export const MyInvitationsScreen = ({ route, navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const token = useAuthStore((state) => state.token);
  const language = usePreferencesStore((state) => state.language);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const activeFilter = FILTERS.includes(route.params?.filter) ? route.params.filter : "all";
  const visibleInvitations = filterInvitations(invitations, activeFilter);

  const filterLabels = {
    all: t("settings.allInvitationsFilter"),
    accepted: t("contacts.acceptedUsers"),
    connections: t("contacts.totalConnections"),
    recent: t("contacts.recentConnections"),
  };

  const loadInvitations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setInvitations(await InvitationsAPI.listInvitations(token, language));
    } catch (error) {
      showAlert(t("common.error"), t("settings.invitationsLoadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language, t, token]);

  useFocusEffect(useCallback(() => {
    loadInvitations();
  }, [loadInvitations]));

  const handleShare = (invitation) => Share.share({
    title: t("contacts.shareInvitationLink"),
    message: t("settings.shareInvitation", {
      code: invitation.code,
      url: invitation.invitationUrl,
    }),
    url: invitation.invitationUrl,
  });

  const handleCopy = async (invitation) => {
    try {
      await copyText(invitation.invitationUrl);
      showAlert(t("common.success"), t("contacts.invitationLinkCopied"));
    } catch (error) {
      showAlert(t("common.error"), t("contacts.invitationLinkCopyFailed"));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={visibleInvitations.length === 0 ? styles.emptyContainer : styles.list}
      data={visibleInvitations}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={(
        <View style={styles.filters}>
          {FILTERS.map((filter) => {
            const selected = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterButton, selected && styles.filterButtonSelected]}
                onPress={() => navigation.setParams({ filter })}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {filterLabels[filter]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadInvitations(true)}
          tintColor={colors.primary}
        />
      )}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <Ionicons name="link-outline" size={34} color={colors.mutedText} />
          <Text style={styles.emptyTitle}>{t("settings.noInvitations")}</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const status = item.status.toLowerCase();
        const statusColor = item.status === "CREATED"
          ? colors.primary
          : item.status === "USED" ? "#247A3E" : "#6E6E73";
        return (
          <View style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={styles.code}>{item.code}</Text>
              <View style={[styles.status, styles[`status_${status}`]]}>
                <Ionicons name={STATUS_ICONS[item.status]} size={15} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {t(`settings.invitationStatus.${status}`)}
                </Text>
              </View>
            </View>
            <Text style={styles.date}>
              {t("settings.invitationCreatedAt", {
                date: new Date(item.createdAt).toLocaleString(),
              })}
            </Text>
            <Text style={styles.date}>
              {t("settings.invitationExpiresAt", {
                date: new Date(item.expiresAt).toLocaleString(),
              })}
            </Text>
            {item.status === "CREATED" && (
              <View style={styles.itemActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleCopy(item)}>
                  <Ionicons name="copy-outline" size={18} color={colors.primary} />
                  <Text style={styles.shareText}>{t("contacts.copyInvitationLink")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item)}>
                  <Ionicons name="share-outline" size={18} color={colors.primary} />
                  <Text style={styles.shareText}>{t("contacts.shareInvitationLink")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }}
    />
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flexGrow: 1, padding: 16 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  filterButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.input,
  },
  filterButtonSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { color: colors.secondaryText, fontSize: 13, fontWeight: "600" },
  filterTextSelected: { color: colors.primary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: colors.secondaryText, fontSize: 16 },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.input,
    padding: 16,
  },
  itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { color: colors.text, fontSize: 18, fontWeight: "700", letterSpacing: 1 },
  status: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  status_created: { backgroundColor: colors.primarySoft },
  status_used: { backgroundColor: "#DFF4E5" },
  status_expired: { backgroundColor: "#F1F1F3" },
  statusText: { fontSize: 12, fontWeight: "700" },
  date: { color: colors.secondaryText, fontSize: 13, marginTop: 8 },
  itemActions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
  },
  shareText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});