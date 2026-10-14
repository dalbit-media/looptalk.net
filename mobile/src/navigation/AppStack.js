import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MessagesStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
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
        options={({ route }) => ({
          title: route.params?.name || t("messages.chat"),
          headerBackTitleVisible: false,
        })}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: t("groups.create") }}
      />
      <Stack.Screen
        name="GroupInfo"
        component={GroupInfoScreen}
        options={{ title: t("groups.info") }}
      />
    </Stack.Navigator>
  );
};

const ContactsStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
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
        options={{ title: t("navigation.createInvitationLink") }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ route }) => ({
          title: route.params?.name || t("navigation.profile"),
        })}
      />
    </Stack.Navigator>
  );
};

const SettingsStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "600" },
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
        options={{ title: t("settings.myInvitations") }}
      />
    </Stack.Navigator>
  );
};

export const AppStack = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
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
