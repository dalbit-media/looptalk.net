import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import { LogBox, Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  createNavigationContainerRef,
  getPathFromState as getNavigationPathFromState,
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
import { WebAlertHost } from "./src/components/WebAlertHost";
import { setupCallNotifications } from "./src/utils/callNotifications";
import { setupNativeCalling } from "./src/utils/nativeCalling";
import { useCallStore } from "./src/store/callStore";

const sentryModule = (() => {
  if (Platform.OS === "web") return null;
  try {
    const runtimeRequire = Function("return require")();
    return runtimeRequire("@sentry/react-native");
  } catch {
    return null;
  }
})();

sentryModule?.init?.({
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
  prefixes: [
    "looptalk://",
    "https://looptalk.app/app/",
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/app/`
      : null,
  ].filter(Boolean),
  config: { screens: { Register: "register" } },
  getPathFromState: (state, options) => {
    const path = getNavigationPathFromState(state, options);
    return Platform.OS === "web" ? `/app${path}` : path;
  },
};

const getWebInvitationState = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
  if (!window.location.pathname.replace(/\/$/, "").endsWith("/app/register")) {
    return undefined;
  }

  const code = new URLSearchParams(window.location.search).get("code")?.trim();
  if (!code) return undefined;

  return {
    index: 0,
    routes: [{ name: "Register", params: { code } }],
  };
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
  const [initialNavigationState] = useState(getWebInvitationState);
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
    if (Platform.OS === "web") return undefined;
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
    messageStore.flushOutbox(token);
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
        initialState={token ? undefined : initialNavigationState}
        onReady={openPendingMessageNotification}
      >
        {token ? <AppStack /> : <AuthStack />}
      </NavigationContainer>
      {token ? <CallOverlay /> : null}
      <WebAlertHost />
    </GestureHandlerRootView>
  );
}

export default sentryModule?.wrap ? sentryModule.wrap(App) : App;
