// Native (iOS/Android) WebRTC bindings.
// A separate `webrtc.web.js` stub exists for web builds, since
// Native WebRTC implementation for Android and iOS.
// Metro automatically picks the right file per platform.
import { Platform } from "react-native";
import { mediaDevices as nativeMediaDevices } from "react-native-webrtc";
export {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  mediaDevices,
  RTCView,
} from "react-native-webrtc";

export const isCallingSupported = true;
export const isVideoCallingSupported = true;
// iOS requires a ReplayKit broadcast extension, not present in this app.
export const isScreenSharingSupported =
  Platform.OS === "android" && Boolean(nativeMediaDevices.getDisplayMedia);
