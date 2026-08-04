import RNCallKeep, { CONSTANTS } from "react-native-callkeep";

let configured = false;
const locallyEndingCalls = new Set();

export const setupNativeCalling = async ({ onAnswer, onEnd, onMute }) => {
  if (configured) return;
  await RNCallKeep.setup({
    ios: {
      appName: "LoopTalk",
      handleType: "generic",
      supportsVideo: true,
      maximumCallGroups: 1,
      maximumCallsPerCallGroup: 1,
      includesCallsInRecents: true,
    },
    android: {
      alertTitle: "Calling permission required",
      alertDescription: "LoopTalk needs access to the system call service.",
      cancelButton: "Cancel",
      okButton: "Allow",
      foregroundService: {
        channelId: "looptalk-calls",
        channelName: "LoopTalk calls",
        notificationTitle: "LoopTalk call in progress",
      },
    },
  });
  configured = true;
  RNCallKeep.setAvailable(true);
  RNCallKeep.canMakeMultipleCalls(false);
  RNCallKeep.addEventListener("answerCall", ({ callUUID }) => onAnswer(callUUID));
  RNCallKeep.addEventListener("endCall", ({ callUUID }) => {
    if (locallyEndingCalls.delete(callUUID)) return;
    onEnd(callUUID);
  });
  RNCallKeep.addEventListener("didPerformSetMutedCallAction", ({ callUUID, muted }) =>
    onMute(callUUID, muted)
  );
  RNCallKeep.addEventListener("checkReachability", () => RNCallKeep.setReachable());
};

export const startNativeOutgoingCall = (call) => {
  RNCallKeep.startCall(
    call.callId,
    call.peerUser?.username || call.peerUser?.id || "LoopTalk",
    call.peerUser?.displayName || call.peerUser?.username || "LoopTalk",
    "generic",
    call.callType === "video"
  );
};

export const displayNativeIncomingCall = (call) => {
  RNCallKeep.displayIncomingCall(
    call.callId,
    call.caller?.username || call.peerUser?.username || "LoopTalk",
    call.caller?.displayName || call.peerUser?.displayName || "LoopTalk",
    "generic",
    call.callType === "video"
  );
};

export const answerNativeCall = (callId) => RNCallKeep.answerIncomingCall(callId);
export const markNativeCallActive = (callId) => RNCallKeep.setCurrentCallActive(callId);
export const setNativeCallMuted = (callId, muted) => RNCallKeep.setMutedCall(callId, muted);

export const endNativeCall = (callId, reason = "local") => {
  if (!callId) return;
  if (reason === "local") {
    locallyEndingCalls.add(callId);
    RNCallKeep.endCall(callId);
    return;
  }
  const endReason =
    reason === "answered-elsewhere"
      ? CONSTANTS.END_CALL_REASONS.ANSWERED_ELSEWHERE
      : reason === "declined-elsewhere"
        ? CONSTANTS.END_CALL_REASONS.DECLINED_ELSEWHERE
        : reason === "missed"
          ? CONSTANTS.END_CALL_REASONS.MISSED
          : CONSTANTS.END_CALL_REASONS.REMOTE_ENDED;
  RNCallKeep.reportEndCallWithUUID(callId, endReason);
};

export const rejectNativeCall = (callId) => {
  locallyEndingCalls.add(callId);
  RNCallKeep.rejectCall(callId);
};