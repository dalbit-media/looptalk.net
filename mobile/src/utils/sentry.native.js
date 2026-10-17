import * as Sentry from "@sentry/react-native";

export const initSentry = () => {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
    environment: __DEV__ ? "development" : "production",
    sendDefaultPii: false,
  });
};

export const wrapWithSentry = (AppComponent) => Sentry.wrap(AppComponent);
