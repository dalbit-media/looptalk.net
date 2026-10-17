import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Animated, RefreshControl } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { ContactIdentity } from "../../components/ContactIdentity";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { SearchBar } from "../../components/SearchBar";
import { FilterDropdown } from "../../components/FilterDropdown";
import { useAuthStore } from "../../store/authStore";
import { useContactStore } from "../../store/contactStore";
import { useMessageStore } from "../../store/messageStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppTheme } from "../../hooks/useAppTheme";
import { showAlert } from "../../utils/showAlert";

const GROUP_KEYS = {
  "Family 1": "family1",
  "Family 2": "family2",
  "All Contacts 1": "allContacts1",
  "All Contacts 2": "allContacts2",
  "Work 1": "work1",
  "Work 2": "work2",
  "Project 1": "project1",
  "Project 2": "project2",
  "School 1": "school1",
  "School 2": "school2",
  "Class 1": "class1",
  "Class 2": "class2",
};

export const ContactsScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const token = useAuthStore((state) => state.token);
  const contacts = useContactStore((state) => state.contacts);
  const onlineUsers = useMessageStore((state) => state.onlineUsers);
  const presenceConnected = useMessageStore((state) => state.presenceConnected);
  const loading = useContactStore((state) => state.loading);
  const loadContacts = useContactStore((state) => state.loadContacts);
  const toggleFavorite = useContactStore((state) => state.toggleFavorite);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    loadContacts(token);
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts(token);
    setRefreshing(false);
  };

  const matchesQuery = (contact, query) => {
    if (!query) return true;
    const haystack = [
      contact.nickname,
      contact.contactUser?.displayName,
      contact.contactUser?.username,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  };

  const matchesStatus = (contact) => {
    if (filterKey !== "all" && !presenceConnected) return false;
    const isOnline = onlineUsers.has(contact.contactUser?.id);
    if (filterKey === "online") return isOnline;
    if (filterKey === "offline") return !isOnline;
    return true;
  };

  const filterOptions = [
    { key: "all", label: t("contacts.filterAll") },
    { key: "online", label: t("contacts.filterOnline") },
    { key: "offline", label: t("contacts.filterOffline") },
  ];

  const hasAnyContacts = Object.values(contacts).some(
    (contactList) => contactList && contactList.length > 0
  );

  const convertToSections = () => {
    const query = searchQuery.trim().toLowerCase();
    const sections = [];
    const favorites = [];

    Object.entries(contacts).forEach(([groupName, contactList]) => {
      if (!contactList || contactList.length === 0) return;

      const filteredList = contactList.filter(
        (contact) => matchesQuery(contact, query) && matchesStatus(contact)
      );
      filteredList.forEach((contact) => {
        if (contact.isFavorite) favorites.push(contact);
      });

      if (filteredList.length > 0) {
        sections.push({
          key: groupName,
          title: GROUP_KEYS[groupName]
            ? t(`contacts.${GROUP_KEYS[groupName]}`)
            : groupName,
          memberUsers: filteredList.map((contact) => contact.contactUser).filter(Boolean),
          data: collapsedGroups[groupName]
            ? []
            : filteredList.map((contact) => ({
                ...contact,
                _key: `${groupName}-${contact.id}`,
              })),
        });
      }
    });
    sections.sort((a, b) => a.title.localeCompare(b.title));

    if (favorites.length > 0) {
      sections.unshift({
        key: "favorites",
        title: t("contacts.favorites"),
        memberUsers: favorites.map((contact) => contact.contactUser).filter(Boolean),
        data: collapsedGroups.favorites
          ? []
          : favorites.map((contact) => ({
              ...contact,
              _key: `favorites-${contact.id}`,
            })),
      });
    }

    return sections;
  };

  const sections = useMemo(
    () => convertToSections(),
    [contacts, onlineUsers, presenceConnected, searchQuery, filterKey, collapsedGroups, t]
  );
  const sectionKeys = sections.map((section) => section.key);
  const sectionKeysKey = sectionKeys.join("|");
  const allGroupsCollapsed =
    sections.length > 0 && sections.every((section) => collapsedGroups[section.key]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate("AddContact", { mode: "search" })}
            hitSlop={10}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel={t("contacts.searchUsersById")}
          >
            <View style={styles.searchHeaderIcon}>
              <Ionicons name="search" size={22} color={colors.headerIcon} />
              <View style={styles.addBadge}>
                <Ionicons name="add" size={12} color="#FFFFFF" />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              setCollapsedGroups(
                Object.fromEntries(sectionKeys.map((key) => [key, !allGroupsCollapsed]))
              )
            }
            hitSlop={10}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel={t(allGroupsCollapsed ? "contacts.expandGroups" : "contacts.collapseGroups")}
          >
            <Ionicons
              name={allGroupsCollapsed ? "albums-outline" : "albums"}
              size={23}
              color={colors.headerIcon}
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [allGroupsCollapsed, colors, navigation, sectionKeysKey, t]);

  const renderContactItem = ({ item }) => {
    const scaleAnim = new Animated.Value(1);

    const handlePress = () => {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start(() => {
        navigation.navigate("Profile", {
          userId: item.contactUser.id,
          name: item.nickname || item.contactUser.displayName,
        });
      });
    };

    const handleToggleFavorite = (event) => {
      event.stopPropagation();
      toggleFavorite(item.contactUser.id, !item.isFavorite, token).catch(() => {
        showAlert(t("common.error"), t("contacts.favoriteFailed"));
      });
    };

    return (
      <Animated.View
        style={[
          styles.contactItem,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.contactTouchable}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <ContactIdentity
            user={item.contactUser}
            displayName={item.nickname || item.contactUser.displayName}
            searchQuery={searchQuery}
            showOnline
            colors={colors}
          />

          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={handleToggleFavorite}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              item.isFavorite
                ? t("contacts.removeFavorite")
                : t("contacts.addFavorite")
            }
          >
            <Ionicons
              name={item.isFavorite ? "star" : "star-outline"}
              size={20}
              color={item.isFavorite ? "#FFD700" : colors.mutedText}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <TouchableOpacity
        style={styles.sectionTitleButton}
        onPress={() =>
          setCollapsedGroups((current) => ({
            ...current,
            [section.key]: !current[section.key],
          }))
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsedGroups[section.key] }}
      >
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.memberUsers.length}</Text>
        <Ionicons
          name={collapsedGroups[section.key] ? "chevron-down" : "chevron-up"}
          size={18}
          color={colors.secondaryText}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.groupChatButton}
        onPress={() =>
          navigation.getParent()?.navigate("Messages", {
            screen: "CreateGroup",
            params: {
              initialSelectedUsers: section.memberUsers,
              startAtName: true,
            },
          })
        }
        disabled={section.memberUsers.length < 2}
        accessibilityRole="button"
        accessibilityLabel={t("contacts.startGroupChatFromGroup", { group: section.title })}
      >
        <Ionicons
          name="people-outline"
          size={20}
          color={section.memberUsers.length < 2 ? colors.mutedText : colors.primary}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.searchRow}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("contacts.searchPlaceholder")}
          colors={colors}
          style={styles.searchBarFlex}
        />
        <FilterDropdown
          options={filterOptions}
          selectedKey={filterKey}
          onSelect={setFilterKey}
          colors={colors}
        />
      </View>
      {loading && sections.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : sections.length === 0 ? (
        hasAnyContacts ? (
          <EmptyState icon="search-outline" title={t("contacts.noResults")} message="" />
        ) : (
          <EmptyState
            icon="people-outline"
            title={t("contacts.noContacts")}
            action={{
              icon: "link-outline",
              label: t("contacts.createInvitationLink"),
              onPress: () => navigation.navigate("AddContact"),
            }}
          />
        )
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._key}
          renderItem={renderContactItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          stickySectionHeadersEnabled
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddContact")}
      >
        <Ionicons name="link" size={25} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: 80,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  searchBarFlex: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitleButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.secondaryText,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: colors.mutedText,
    fontSize: 12,
  },
  groupChatButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchHeaderIcon: {
    width: 28,
    height: 28,
    justifyContent: "center",
  },
  addBadge: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  contactItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactTouchable: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  favoriteButton: {
    padding: 4,
    marginLeft: 8,
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
});
