import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "./src/store/authStore";
import { AuthStack } from "./src/navigation/AuthStack";
import { AppStack } from "./src/navigation/AppStack";
import { loadI18n } from "./src/i18n/i18n";
import { useAppTheme } from "./src/hooks/useAppTheme";
import { usePreferencesStore } from "./src/store/preferencesStore";
import { useMessageStore } from "./src/store/messageStore";
import { useContactStore } from "./src/store/contactStore";
import { AppSplash } from "./src/components/AppSplash";
import { CallOverlay } from "./src/components/CallOverlay";
import { setupCallNotifications } from "./src/utils/callNotifications";
import { setupNativeCalling } from "./src/utils/nativeCalling";
import { useCallStore } from "./src/store/callStore";
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  environment: __DEV__ ? "development" : "production",
  sendDefaultPii: false,
});

const navigationRef = createNavigationContainerRef();
let pendingMessageNotification = null;

const openPendingMessageNotification = () => {
  if (
    !pendingMessageNotification ||
    !navigationRef.isReady() ||
    !useAuthStore.getState().token
  ) {
    return;
  }
  const data = pendingMessageNotification;
  pendingMessageNotification = null;
  navigationRef.navigate("Messages", {
    screen: "Chat",
    params: {
      conversationId: data.conversationId,
      name: data.senderName,
    },
  });
};

const handleMessageNotification = (data) => {
  if (!data?.conversationId) return;
  pendingMessageNotification = data;
  openPendingMessageNotification();
};

const linking = {
  prefixes: ["looptalk://", "https://looptalk.app/app/"],
  config: { screens: { Register: "register" } },
};

LogBox.ignoreLogs([
  "Non-serializable values were found in the navigation state",
  "Animated: `useNativeDriver`",
]);

SplashScreen.preventAutoHideAsync();

const Notifications = require("expo-notifications");
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function App() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const loading = useAuthStore((state) => state.loading);
  const [showSplash, setShowSplash] = useState(true);
  const { navigationTheme } = useAppTheme();

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        loadI18n();
        await usePreferencesStore.getState().initialize();
        await SplashScreen.hideAsync();

        const minimumSplashTime = new Promise((resolve) =>
          setTimeout(resolve, 900)
        );
        await useAuthStore.getState().initialize();

        await minimumSplashTime;
      } catch (e) {
        console.log(e);
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
        if (mounted) setShowSplash(false);
      }
    }

    initialize();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cleanupNotifications;
    setupNativeCalling({
      onAnswer: (callId) =>
        useCallStore.getState().handleNativeCallAction(callId, "answer"),
      onEnd: (callId) =>
        useCallStore.getState().handleNativeCallAction(callId, "end"),
      onMute: (callId, muted) =>
        useCallStore.getState().handleNativeMute(callId, muted),
    })
      .then(() =>
        setupCallNotifications({
          onCallAction: (callId, action) =>
            useCallStore.getState().handleNativeCallAction(callId, action),
          onMessageOpen: handleMessageNotification,
        })
      )
      .then((cleanup) => {
        cleanupNotifications = cleanup;
      })
      .catch((error) => console.error("Unable to initialize native calling:", error));
    return () => cleanupNotifications?.();
  }, []);

  useEffect(() => {
    if (!token || !userId) return undefined;

    const messageStore = useMessageStore.getState();
    messageStore.initSocket(token, userId);
    messageStore.loadConversations(token, userId);
    useContactStore.getState().loadContacts(token);
    openPendingMessageNotification();

    return () => messageStore.cleanup();
  }, [token, userId]);

  if (showSplash || loading) {
    return <AppSplash />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        linking={linking}
        onReady={openPendingMessageNotification}
      >
        {token ? <AppStack /> : <AuthStack />}
      </NavigationContainer>
      {token ? <CallOverlay /> : null}
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
