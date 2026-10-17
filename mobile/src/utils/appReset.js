import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { API_URL } from "../config/environment";
import { clearClientStorage } from "../storage/resetStorage";

const markerKey = `looptalk:app-reset:${API_URL}`;
let observedResetId;
let inFlight;

const synchronize = async (beforeClear) => {
  let response;
  try {
    response = await api.get("/app-state", { timeout: 10000, headers: { "Cache-Control": "no-cache" } });
  } catch (error) {
    if ((error.isAxiosError && !error.response) || error.response?.status === 404) {
      console.warn("Application reset check unavailable; it will be retried on reconnect:", error.message);
      return false;
    }
    throw error;
  }
  const resetId = response.data?.resetId;
  if (resetId !== "initial" && (typeof resetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(resetId))) {
    throw new Error("Invalid application reset state");
  }
  const savedResetId = await AsyncStorage.getItem(markerKey);
  const previous = observedResetId ?? savedResetId;
  const shouldClear = resetId !== "initial" && resetId !== previous;
  if (shouldClear) {
    const userId = await beforeClear();
    if (await AsyncStorage.getItem(markerKey) !== resetId) {
      await clearClientStorage(userId);
    }
  }
  await AsyncStorage.setItem(markerKey, resetId);
  observedResetId = resetId;
  return shouldClear;
};

export const synchronizeAppReset = (beforeClear) => {
  if (!inFlight) {
    inFlight = synchronize(beforeClear).finally(() => { inFlight = null; });
  }
  return inFlight;
};
