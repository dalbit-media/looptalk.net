import InCallManager from "./inCallManager";

export const prepareIncomingRingtone = () => undefined;

export const startIncomingRingtone = () => {
  InCallManager.startRingtone("_DEFAULT_", null, "default", 45);
};

export const stopIncomingRingtone = () => {
  InCallManager.stopRingtone();
};