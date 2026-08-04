// Native (iOS/Android) WebRTC bindings.
// A separate `webrtc.web.js` stub exists for web builds, since
// react-native-webrtc requires native code and has no web target.
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
