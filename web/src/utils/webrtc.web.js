const browser = typeof globalThis !== "undefined" ? globalThis : {};

export const RTCPeerConnection = browser.RTCPeerConnection;
export const RTCSessionDescription = browser.RTCSessionDescription;
export const RTCIceCandidate = browser.RTCIceCandidate;
export const MediaStream = browser.MediaStream;
export const RTCView = null;

export const isCallingSupported = Boolean(
	RTCPeerConnection && browser.navigator?.mediaDevices?.getUserMedia
);
export const isVideoCallingSupported = isCallingSupported;

export const mediaDevices = browser.navigator?.mediaDevices;
export const isScreenSharingSupported = Boolean(mediaDevices?.getDisplayMedia);
