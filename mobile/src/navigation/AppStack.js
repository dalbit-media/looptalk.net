import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MessagesScreen } from "../screens/app/MessagesScreen";
import { ChatScreen } from "../screens/app/ChatScreen";
import { ContactsScreen } from "../screens/app/ContactsScreen";
import { SettingsScreen } from "../screens/app/SettingsScreen";
import { ProfileScreen } from "../screens/app/ProfileScreen";
import { AddContactScreen } from "../screens/app/AddContactScreen";
import { MyInvitationsScreen } from "../screens/app/MyInvitationsScreen";
import { CreateGroupScreen } from "../screens/app/CreateGroupScreen";
import { GroupInfoScreen } from "../screens/app/GroupInfoScreen";
import { useTranslation } from "../hooks/useTranslation";
import { useAppTheme } from "../hooks/useAppTheme";
import { usePreferencesStore } from "../store/preferencesStore";
import { getAppTextScale } from "../utils/chatTextSize";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const getBackButtonOptions = (navigation, t) => ({
  headerLeft: ({ tintColor }) => (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={10}
      style={{
        minWidth: 44,
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 8,
      }}
      accessibilityRole="button"
      accessibilityLabel={t("profile.back")}
    >
      <Ionicons name="chevron-back" size={24} color={tintColor} />
    </TouchableOpacity>
  ),
});

const MessagesStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const textSize = usePreferencesStore((state) => state.chatTextSize);
  const textScale = getAppTextScale(textSize);
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontSize: 17 * textScale,
          fontWeight: "600",
          color: colors.text,
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ title: t("brand.name") }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route, navigation }) => ({
          title: route.params?.name || t("messages.chat"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: t("navigation.profile"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={({ navigation }) => ({
          title: t("groups.create"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
      <Stack.Screen
        name="GroupInfo"
        component={GroupInfoScreen}
        options={({ navigation }) => ({
          title: t("groups.info"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
    </Stack.Navigator>
  );
};

const ContactsStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const textSize = usePreferencesStore((state) => state.chatTextSize);
  const textScale = getAppTextScale(textSize);
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontSize: 17 * textScale,
          fontWeight: "600",
          color: colors.text,
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="ContactsList"
        component={ContactsScreen}
        options={{ title: t("navigation.contacts") }}
      />
      <Stack.Screen
        name="AddContact"
        component={AddContactScreen}
        options={({ navigation, route }) => ({
          title: route.params?.mode === "search"
            ? t("contacts.searchForUser")
            : t("navigation.createInvitationLink"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: t("navigation.profile"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
    </Stack.Navigator>
  );
};

const SettingsStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const textSize = usePreferencesStore((state) => state.chatTextSize);
  const textScale = getAppTextScale(textSize);
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontSize: 17 * textScale,
          fontWeight: "600",
          color: colors.text,
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: t("navigation.settings") }}
      />
      <Stack.Screen
        name="MyInvitations"
        component={MyInvitationsScreen}
        options={({ navigation }) => ({
          title: t("settings.myInvitations"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: t("navigation.profile"),
          ...getBackButtonOptions(navigation, t),
        })}
      />
    </Stack.Navigator>
  );
};

export const AppStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const textSize = usePreferencesStore((state) => state.chatTextSize);
  const textScale = getAppTextScale(textSize);
  const insets = useSafeAreaInsets();
  const tabBarHeight = 84 + Math.round((textScale - 1) * 24) + insets.bottom;
  const tabBarBottomPadding = Math.max(insets.bottom, 10);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === "Messages") {
            iconName = focused ? "chatbubble" : "chatbubble-outline";
          } else if (route.name === "Contacts") {
            iconName = focused ? "people" : "people-outline";
          } else if (route.name === "Settings") {
            iconName = focused ? "settings" : "settings-outline";
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarStyle: {
          height: tabBarHeight,
          minHeight: tabBarHeight,
          paddingTop: 6,
          paddingBottom: tabBarBottomPadding,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarItemStyle: {
          justifyContent: "center",
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12 * textScale,
          lineHeight: 18 * textScale,
          marginBottom: 3 * textScale,
        },
      })}
    >
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{
          title: t("navigation.messages"),
          tabBarLabel: t("navigation.messages"),
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsStack}
        options={{
          title: t("navigation.contacts"),
          tabBarLabel: t("navigation.contacts"),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          title: t("navigation.settings"),
          tabBarLabel: t("navigation.settings"),
        }}
      />
    </Tab.Navigator>
  );
};
