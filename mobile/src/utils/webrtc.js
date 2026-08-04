// Native (iOS/Android) WebRTC bindings.
// A separate `webrtc.web.js` stub exists for web builds, since
// Native WebRTC implementation for Android and iOS.
// Metro automatically picks the right file per platform.
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
export const isScreenSharingSupported = false;
