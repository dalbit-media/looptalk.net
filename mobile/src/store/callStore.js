import { create } from "zustand";
import { AppState } from "react-native";
import { api } from "../api/client";
import { useAuthStore } from "./authStore";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  mediaDevices,
  isCallingSupported,
  isVideoCallingSupported,
  isScreenSharingSupported,
} from "../utils/webrtc";
import InCallManager from "../utils/inCallManager";
import { requestCallPermissions } from "../utils/requestCallPermissions";
import { summarizeCallStats, videoEncodingProfile } from "../utils/callQuality";
import {
  answerNativeCall,
  displayNativeIncomingCall,
  endNativeCall,
  markNativeCallActive,
  rejectNativeCall,
  setNativeCallMuted,
  startNativeOutgoingCall,
} from "../utils/nativeCalling";

const FALLBACK_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const PEER_CONNECTION_OPTIONS = {
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 0,
};
const copyIceServers = (servers) => servers.map((server) => ({
  ...server,
  urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
}));
let cachedIceConfiguration = null;
let callEpoch = 0;
const senderParameterChains = new WeakMap();

const getIceServers = async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = useAuthStore.getState().token;
  if (!token) return FALLBACK_ICE_SERVERS;
  if (cachedIceConfiguration?.token === token && cachedIceConfiguration.expiresAt > now + 60) {
    return cachedIceConfiguration.iceServers;
  }
  try {
    const { data } = await api.get("/calls/ice-servers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) {
      throw new Error("The ICE configuration contains no servers");
    }
    cachedIceConfiguration = { ...data, token };
    return data.iceServers;
  } catch (error) {
    console.error("Unable to load TURN credentials:", error);
    return FALLBACK_ICE_SERVERS;
  }
};

const CALL_EVENTS = [
  "call:incoming",
  "call:answered",
  "call:offer",
  "call:ice-candidate",
  "call:declined",
  "call:ended",
];

const AUDIO_CONSTRAINTS = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

const buildMediaConstraints = (callType, facingMode = "user") => ({
  audio: AUDIO_CONSTRAINTS,
  video:
    callType === "video"
      ? {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false,
});

const captureLocalMedia = async (callType, facingMode = "user") => {
  try {
    await requestCallPermissions(callType);
    try {
      return await mediaDevices.getUserMedia(buildMediaConstraints(callType, facingMode));
    } catch (error) {
      if (!["OverconstrainedError", "ConstraintNotSatisfiedError", "TypeError"].includes(error?.name)) {
        throw error;
      }
      return await mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: callType === "video" ? { facingMode } : false });
    }
  } catch (error) {
    if (callType !== "video") throw error;
    console.warn("Camera capture unavailable; joining with audio only:", error);
    await requestCallPermissions("audio");
    return mediaDevices.getUserMedia(buildMediaConstraints("audio"));
  }
};

const replaceVideoTrack = async (sender, track) => {
  await sender.replaceTrack(track);
  // Native WebRTC can resolve a failed replacement without changing track.
  if (sender.track !== track) throw new Error("Unable to replace outgoing video");
};

const candidateMatchesDescription = (candidate, description) => {
  const fragment = candidate.usernameFragment || candidate.candidate?.match(/\bufrag (\S+)/)?.[1];
  return !fragment || !description?.sdp || description.sdp.split(/\r?\n/).includes(`a=ice-ufrag:${fragment}`);
};

const waitForCallSignaling = async (getSocket, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  let socket = getSocket();

  while (!socket && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket = getSocket();
  }

  if (socket?.connected) return;
  if (socket) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.off("connect", finish);
        resolve();
      };
      const timeout = setTimeout(finish, Math.max(0, deadline - Date.now()));
      socket.on("connect", finish);
      if (socket.connected) finish();
    });
  }

  if (!getSocket()?.connected) {
    const error = new Error("Call signaling is unavailable");
    error.code = "CALL_SIGNALING_UNAVAILABLE";
    throw error;
  }
};

const QUALITY_MONITOR_INTERVAL_MS = 4000;
let qualityMonitorTimer = null;
const clearQualityMonitor = () => {
  if (qualityMonitorTimer) {
    clearInterval(qualityMonitorTimer);
    qualityMonitorTimer = null;
  }
};

// Pausing the camera while the app is backgrounded saves encode CPU/battery;
// `wasAutoPaused` distinguishes that from the user's own mute-camera choice
// so we only auto-resume what we auto-paused.
let appStateSubscription = null;
let wasAutoPaused = false;

const RECONNECT_TIMEOUT_MS = 30000;

let reconnectTimer = null;
let iceRestartTimer = null;
let iceRestartAttempts = 0;
let iceRestartInFlight = false;
let negotiationChain = Promise.resolve();
const earlyIceCandidates = new Map();
const queueEarlyIceCandidate = (callId, candidate) => {
  if (!earlyIceCandidates.has(callId) && earlyIceCandidates.size >= 8) {
    earlyIceCandidates.delete(earlyIceCandidates.keys().next().value);
  }
  const candidates = earlyIceCandidates.get(callId) || [];
  earlyIceCandidates.set(callId, [...candidates, candidate].slice(-64));
};
const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (iceRestartTimer) clearTimeout(iceRestartTimer);
  iceRestartTimer = null;
  iceRestartAttempts = 0;
};

const RING_TIMEOUT_MS = 45000;
const CONNECT_TIMEOUT_MS = 30000;
let ringTimer = null;
let connectTimer = null;
const clearSetupTimers = () => {
  if (ringTimer) clearTimeout(ringTimer);
  if (connectTimer) clearTimeout(connectTimer);
  ringTimer = null;
  connectTimer = null;
};

const generateCallId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });

const pendingNativeActions = new Map();

export const useCallStore = create((set, get) => ({
  socket: null,
  isCallingSupported,
  isVideoCallingSupported,
  isScreenSharingSupported,
  call: null,
  pendingOffer: null,
  pendingIceCandidates: [],
  pc: null,
  localStream: null,
  remoteStream: null,
  screenStream: null,
  isMuted: false,
  isCameraOff: true,
  isScreenSharing: false,
  isChangingMedia: false,
  isRestoringMicrophone: false,
  microphoneUnavailable: false,
  remoteVideoActive: false,
  remoteMediaState: null,
  mediaStateChannel: null,
  isSpeakerOn: false,
  isStartingCall: false,
  networkQuality: "good",
  minimized: false,
  audioSender: null,
  videoSender: null,

  _emitSignal: (eventName, payload, required = false) => {
    const socket = get().socket;
    if (!socket?.connected) {
      if (required) throw new Error("Call signaling is offline");
      return false;
    }
    socket.emit(eventName, payload);
    return true;
  },

  _runNegotiation: (operation) => {
    const result = negotiationChain.then(operation, operation);
    negotiationChain = result.catch(() => {});
    return result;
  },

  _handleSocketConnect: () => {
    const { call: current, pc } = get();
    if (current && !["ended", "declined"].includes(current.status)) {
      get()._emitSignal("call:resume", {
        callId: current.callId,
        conversationId: current.conversationId,
      });
    }
    if (
      current?.status === "reconnecting" &&
      current.direction === "outgoing" &&
      pc?.connectionState !== "connected"
    ) {
      if (iceRestartTimer) clearTimeout(iceRestartTimer);
      iceRestartTimer = null;
      get()._attemptIceRestart(current.callId);
    }
  },

  _handleSocketDisconnect: () => {
    const { call: current } = get();
    if (current?.direction === "incoming" && current.status === "ringing") {
      endNativeCall(current.callId, "missed");
      get()._teardown();
      set({ call: null, pendingOffer: null });
    }
  },

  attachSocket: (socket) => {
    if (get().socket === socket) return;
    get()._detachListeners();
    set({ socket });
    if (!socket || !isCallingSupported) return;

    socket.on("call:incoming", (data) => get()._handleIncoming(data));
    socket.on("call:answered", (data) => get()._handleAnswered(data));
    socket.on("call:offer", (data) => get()._handleRemoteOffer(data));
    socket.on("call:ice-candidate", (data) => get()._handleRemoteIceCandidate(data));
    socket.on("call:declined", (data) => get()._handleRemoteDecline(data));
    socket.on("call:ended", (data) => get()._handleRemoteEnd(data));
  },

  detachSocket: () => {
    get()._detachListeners();
    get()._teardown();
    set({ socket: null, call: null, pendingOffer: null });
  },

  _detachListeners: () => {
    const socket = get().socket;
    if (!socket) return;
    CALL_EVENTS.forEach((event) => socket.off(event));
  },

  _createPeerConnection: async (conversationId, callId) => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({
      ...PEER_CONNECTION_OPTIONS,
      iceServers: copyIceServers(iceServers),
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        get()._emitSignal("call:ice-candidate", {
          conversationId,
          callId,
          candidate: event.candidate,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      const current = get().call;
      if (!current || current.callId !== callId || get().pc !== pc) return;

      if (pc.connectionState === "connected") {
        clearReconnectTimer();
        clearSetupTimers();
        set({ call: { ...current, status: "connected", connectedAt: current.connectedAt || Date.now() } });
        markNativeCallActive(callId);
        const { audioSender, videoSender } = get();
        if (audioSender) get()._applyInitialAudioParameters(audioSender);
        if (videoSender?.track) get()._applyInitialVideoParameters(videoSender);
        get()._startQualityMonitor(callId);
        get()._publishMediaState();
        return;
      }

      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        get()._beginRecovery(callId, pc.connectionState === "failed");
      }
    };
    pc.oniceconnectionstatechange = () => {
      const current = get().call;
      if (!current || current.callId !== callId || get().pc !== pc) return;
      if (pc.iceConnectionState === "failed") {
        get()._beginRecovery(callId, true);
      }
    };
    pc.ontrack = (event) => {
      if (get().pc !== pc) return;
      const remoteStream = get().remoteStream || event.streams?.[0] || new MediaStream();
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      const updateVideo = () => {
        if (get().pc !== pc) return;
        set({
          remoteVideoActive: remoteStream.getVideoTracks().some(
            (track) => track.readyState === "live" && !track.muted
          ),
        });
        get()._updateKeepAwake();
      };
      if (event.track.kind === "video") {
        event.track.onmute = updateVideo;
        event.track.onunmute = updateVideo;
        event.track.onended = updateVideo;
      }
      set({ remoteStream });
      updateVideo();
    };
    pc.ondatachannel = (event) => get()._attachMediaStateChannel(pc, event.channel);
    return pc;
  },

  _attachMediaStateChannel: (pc, channel) => {
    if (get().pc !== pc || channel.label !== "looptalk-media-v1") {
      channel.close();
      return;
    }
    set({ mediaStateChannel: channel });
    channel.onopen = () => {
      if (get().pc === pc) get()._publishMediaState();
    };
    channel.onmessage = (event) => {
      if (get().pc !== pc) return;
      try {
        if (typeof event.data !== "string" || event.data.length > 1024) {
          throw new Error("Invalid media status payload");
        }
        const state = JSON.parse(event.data);
        if (state?.version !== 1 || typeof state.muted !== "boolean" || !["none", "camera", "screen"].includes(state.video)) {
          throw new Error("Invalid media status");
        }
        set({ remoteMediaState: { muted: state.muted, video: state.video } });
        get()._updateKeepAwake();
      } catch (error) {
        console.warn("Unable to read peer media status:", error);
      }
    };
    channel.onerror = (error) => console.warn("Call media status channel error:", error);
    channel.onclose = () => {
      if (get().mediaStateChannel === channel) set({ mediaStateChannel: null, remoteMediaState: null });
    };
    if (channel.readyState === "open") get()._publishMediaState();
  },

  _publishMediaState: () => {
    get()._updateKeepAwake();
    const { mediaStateChannel, isMuted, isCameraOff, isScreenSharing } = get();
    if (mediaStateChannel?.readyState !== "open") return;
    try {
      mediaStateChannel.send(JSON.stringify({
        version: 1,
        muted: isMuted,
        video: isScreenSharing ? "screen" : isCameraOff || wasAutoPaused ? "none" : "camera",
      }));
    } catch (error) {
      console.warn("Unable to send call media status:", error);
    }
  },

  _updateKeepAwake: () => {
    const state = get();
    const active = AppState.currentState == null || AppState.currentState === "active";
    const remoteVideo = state.remoteVideoActive && state.remoteMediaState?.video !== "none";
    InCallManager.setKeepScreenOn(Boolean(
      state.call && active && (state.isScreenSharing || (!state.isCameraOff && !wasAutoPaused) || remoteVideo)
    ));
  },

  _watchLocalTrack: (pc, stream, track) => {
    track.onended = () => {
      if (get().pc !== pc || get().localStream !== stream) return;
      stream.removeTrack(track);
      if (track.kind === "audio") {
        set({ microphoneUnavailable: true, isMuted: true });
        if (get().call) setNativeCallMuted(get().call.callId, true);
        console.warn("The call microphone disconnected");
      } else {
        set({ isCameraOff: true });
        console.warn("The call camera disconnected");
      }
      get()._publishMediaState();
    };
  },

  _attachLocalTracks: (pc, localStream) => {
    localStream.getTracks().forEach((track) => {
      if (track.kind === "audio") track.enabled = !get().isMuted;
      if (track.kind === "video" && "contentHint" in track) track.contentHint = "motion";
      pc.addTrack(track, localStream);
      get()._watchLocalTrack(pc, localStream, track);
    });
    // Negotiate video even for voice-only peers so replaceTrack can later
    // enable a camera or screen without another offer (or offer collisions).
    const videoTransceiver = pc.getTransceivers().find(
      (transceiver) => transceiver.receiver.track?.kind === "video"
    ) || pc.addTransceiver("video", { direction: "sendrecv", streams: [localStream] });
    videoTransceiver.direction = "sendrecv";
    videoTransceiver.sender.setStreams?.(localStream);
    const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
    const videoSender = videoTransceiver.sender;
    set({ audioSender, videoSender });
    if (get().call?.direction === "outgoing") {
      get()._attachMediaStateChannel(pc, pc.createDataChannel("looptalk-media-v1", { ordered: true }));
    }
  },

  _updateSenderParameters: (sender, encoding, degradationPreference) => {
    const pc = get().pc;
    const track = sender.track;
    const previous = senderParameterChains.get(sender) || Promise.resolve();
    const result = previous.then(async () => {
      if (get().pc !== pc || sender.track !== track || !track) return;
      const params = sender.getParameters();
      if (!params.encodings?.length) {
        console.warn("Sender encodings are not negotiated yet");
        return;
      }
      Object.assign(params.encodings[0], encoding);
      if (track.kind === "audio") {
        if ("priority" in params.encodings[0]) params.encodings[0].priority = "high";
        if ("networkPriority" in params.encodings[0]) params.encodings[0].networkPriority = "high";
      }
      if (degradationPreference) params.degradationPreference = degradationPreference;
      await sender.setParameters(params);
    });
    senderParameterChains.set(sender, result.catch(() => {}));
    return result;
  },

  // These are ceilings, not bandwidth targets; WebRTC owns congestion control.
  _applyInitialVideoParameters: async (sender) => {
    try {
      const { degradationPreference, ...encoding } = videoEncodingProfile(get().isScreenSharing);
      await get()._updateSenderParameters(sender, encoding, degradationPreference);
    } catch (error) {
      console.warn("Unable to apply video parameters:", error);
    }
  },

  _applyInitialAudioParameters: async (sender) => {
    try {
      await get()._updateSenderParameters(sender, { maxBitrate: 48000 });
    } catch (error) {
      console.warn("Unable to apply initial audio parameters:", error);
    }
  },

  _startQualityMonitor: (callId) => {
    clearQualityMonitor();
    let sampling = false;
    let previousAudioStats = new Map();
    let recoveryTarget = null;
    let recoverySamples = 0;
    const ranks = { good: 0, fair: 1, poor: 2 };
    qualityMonitorTimer = setInterval(async () => {
      const { call, pc } = get();
      if (sampling || !call || call.callId !== callId || !pc || call.status !== "connected") return;
      sampling = true;
      try {
        const stats = await pc.getStats();
        if (get().pc !== pc) return;
        const { audio, quality } = summarizeCallStats(stats, previousAudioStats);
        previousAudioStats = audio;
        if (ranks[quality] >= ranks[get().networkQuality]) {
          recoverySamples = 0;
          recoveryTarget = null;
          if (get().networkQuality !== quality) set({ networkQuality: quality });
        } else {
          recoverySamples = recoveryTarget === quality ? recoverySamples + 1 : 1;
          recoveryTarget = quality;
          if (recoverySamples >= 3) set({ networkQuality: quality });
        }
      } catch (error) {
        console.warn("Quality monitor error:", error);
      } finally {
        sampling = false;
      }
    }, QUALITY_MONITOR_INTERVAL_MS);
  },

  // Auto-pauses the camera while backgrounded (saves encode CPU/battery) and
  // resumes it on return, without overriding the user's own camera toggle.
  _attachAppStateHandling: () => {
    appStateSubscription?.remove();
    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      get()._updateKeepAwake();
      const { call, localStream, isCameraOff } = get();
      if (!call || !localStream) return;
      const videoTracks = localStream.getVideoTracks();
      if (!videoTracks.length) return;

      if (nextState === "active") {
        if (wasAutoPaused && !isCameraOff) {
          videoTracks.forEach((track) => {
            track.enabled = true;
          });
        }
        wasAutoPaused = false;
      } else if (!isCameraOff) {
        videoTracks.forEach((track) => {
          track.enabled = false;
        });
        wasAutoPaused = true;
      }
      get()._publishMediaState();
    });
  },

  startCall: async (conversationId, callType, peerUser) => {
    if (!isCallingSupported) {
      throw new Error("Calling is not supported on this platform");
    }
    if (callType === "video" && !isVideoCallingSupported) {
      throw new Error("Video calling is not supported on this platform");
    }
    if (get().call || get().isStartingCall) return;
    const epoch = callEpoch;
    set({ isStartingCall: true });
    let localStream;
    let callId;
    try {
      localStream = await captureLocalMedia(callType);
      if (epoch !== callEpoch || get().call) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const resolvedConversationId = typeof conversationId === "function"
        ? await conversationId()
        : conversationId;
      if (epoch !== callEpoch) {
        localStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      await waitForCallSignaling(() => get().socket);
      if (epoch !== callEpoch || get().call) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }

      callId = generateCallId();
      set({
        call: {
          callId,
          conversationId: resolvedConversationId,
          callType,
          direction: "outgoing",
          status: "ringing",
          peerUser,
        },
        pendingIceCandidates: [],
      });
      set({ localStream, isCameraOff: !localStream.getVideoTracks().length });
      try {
        await startNativeOutgoingCall(get().call);
      } catch (error) {
        console.error("Unable to start the native call UI:", error);
      }
      if (epoch !== callEpoch) return false;
      ringTimer = setTimeout(() => {
        ringTimer = null;
        if (get().call?.callId === callId && get().call?.status === "ringing") {
          get().endCall("unanswered");
        }
      }, RING_TIMEOUT_MS);
      get()._startAudioRoute(callType);

      const pc = await get()._createPeerConnection(resolvedConversationId, callId);
      if (get().call?.callId !== callId) {
        pc.close();
        return;
      }
      set({ pc });
      get()._attachLocalTracks(pc, localStream);

      const offer = await pc.createOffer();
      if (get().pc !== pc) return false;
      const description = new RTCSessionDescription(offer);
      await pc.setLocalDescription(description);
      if (get().pc !== pc) return false;

      get()._emitSignal(
        "call:invite",
        { conversationId: resolvedConversationId, callId, callType, sdp: description },
        true
      );
    } catch (error) {
      if (epoch !== callEpoch) {
        localStream?.getTracks().forEach((track) => track.stop());
        return false;
      }
      console.error("Error starting call:", error);
      if (epoch === callEpoch && get().call?.callId === callId) {
        get()._teardown();
        set({ call: null });
      } else if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (error?.name === "NotFoundError") return "device-unavailable";
      throw error;
    } finally {
      if (epoch === callEpoch) set({ isStartingCall: false });
    }
  },

  _handleIncoming: (data) => {
    if (get().call?.callId === data.callId) {
      if (get().call.status === "ringing") set({ pendingOffer: data.sdp });
      return;
    }
    if (Number.isFinite(data.expiresAt) && data.expiresAt <= Date.now()) {
      earlyIceCandidates.delete(data.callId);
      console.warn("Ignoring an expired incoming call");
      return;
    }
    if (data.callType === "video" && !isVideoCallingSupported) {
      earlyIceCandidates.delete(data.callId);
      get()._emitSignal("call:decline", {
        conversationId: data.conversationId,
        callId: data.callId,
        reason: "unsupported",
      });
      return;
    }
    if (get().call || get().isStartingCall) {
      earlyIceCandidates.delete(data.callId);
      get()._emitSignal("call:decline", {
        conversationId: data.conversationId,
        callId: data.callId,
        reason: "busy",
      });
      return;
    }
    set({
      call: {
        callId: data.callId,
        conversationId: data.conversationId,
        callType: data.callType,
        direction: "incoming",
        status: "ringing",
        peerUser: data.caller,
      },
      pendingOffer: data.sdp,
      pendingIceCandidates: earlyIceCandidates.get(data.callId) || [],
    });
    displayNativeIncomingCall(data);
    earlyIceCandidates.delete(data.callId);
    ringTimer = setTimeout(() => {
      ringTimer = null;
      if (get().call?.callId === data.callId && get().call?.status === "ringing") {
        get().declineCall("missed");
      }
    }, Math.min(RING_TIMEOUT_MS, Number.isFinite(data.expiresAt) ? data.expiresAt - Date.now() : RING_TIMEOUT_MS));
    const nativeAction = pendingNativeActions.get(data.callId);
    pendingNativeActions.delete(data.callId);
    if (nativeAction === "answer") Promise.resolve().then(() => get().acceptCall());
    if (nativeAction === "decline") Promise.resolve().then(() => get().declineCall());
  },

  handleNativeCallAction: (callId, action) => {
    const { call } = get();
    if (!call || call.callId !== callId) {
      pendingNativeActions.set(callId, action);
      return;
    }
    if (action === "answer") get().acceptCall();
    if (action === "decline") get().declineCall();
    if (action === "end") {
      if (call.status === "ringing") get().declineCall();
      else get().endCall();
    }
  },

  handleNativeMute: (callId, muted) => {
    const { call, isMuted } = get();
    if (call?.callId !== callId || isMuted === muted) return;
    if (get().microphoneUnavailable && !muted) {
      get().toggleMute().catch((error) => console.error("Unable to restore the call microphone:", error));
      return;
    }
    get().localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    set({ isMuted: muted });
    get()._publishMediaState();
  },

  acceptCall: async () => {
    const { call, pendingOffer } = get();
    if (
      !call ||
      call.direction !== "incoming" ||
      call.status !== "ringing" ||
      !pendingOffer
    ) return "CALL_CANCELLED";
    if (!get().socket?.connected) return "CALL_SIGNALING_UNAVAILABLE";

    try {
      if (ringTimer) clearTimeout(ringTimer);
      ringTimer = null;
      set({ call: { ...call, status: "connecting" } });
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (get().call?.callId === call.callId && get().call?.status === "connecting") {
          get().endCall("connection-failed");
        }
      }, CONNECT_TIMEOUT_MS);
      answerNativeCall(call.callId);
      const localStream = await captureLocalMedia(call.callType);
      if (get().call?.callId !== call.callId) {
        localStream.getTracks().forEach((track) => track.stop());
        return "CALL_CANCELLED";
      }
      set({ localStream, isCameraOff: !localStream.getVideoTracks().length });
      get()._startAudioRoute(call.callType);

      const pc = await get()._createPeerConnection(call.conversationId, call.callId);
      if (get().call?.callId !== call.callId) {
        pc.close();
        return "CALL_CANCELLED";
      }
      set({ pc });
      await get()._runNegotiation(async () => {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        if (get().pc !== pc) return;
        get()._attachLocalTracks(pc, localStream);
        await get()._flushRemoteIceCandidates(pc, call.callId);
        if (get().pc !== pc) return;
        const answer = await pc.createAnswer();
        if (get().pc !== pc) return;
        const description = new RTCSessionDescription(answer);
        await pc.setLocalDescription(description);
        if (get().pc !== pc) return;
        get()._emitSignal("call:answer", {
          conversationId: call.conversationId,
          callId: call.callId,
          sdp: description,
        }, true);
      });
      if (get().pc !== pc) return "CALL_CANCELLED";
      set({ pendingOffer: null });
      return true;
    } catch (error) {
      if (get().call?.callId !== call.callId) return "CALL_CANCELLED";
      console.error("Error accepting call:", error);
      if (get().call?.callId === call.callId) get().declineCall();
      if (error?.code === "CALL_PERMISSION_DENIED" || ["NotAllowedError", "SecurityError"].includes(error?.name)) {
        return "CALL_PERMISSION_DENIED";
      }
      return error?.name === "NotFoundError" ? "CALL_DEVICE_UNAVAILABLE" : false;
    }
  },

  declineCall: (reason = "declined") => {
    const { call } = get();
    if (call) {
      if (reason === "missed") endNativeCall(call.callId, "missed");
      else rejectNativeCall(call.callId);
      get()._emitSignal("call:decline", {
        conversationId: call.conversationId,
        callId: call.callId,
        reason,
      });
    }
    get()._teardown();
    set({ call: null, pendingOffer: null });
  },

  _handleAnswered: async (data) => {
    const { call, pc } = get();
    if (!call || call.callId !== data.callId || !pc) return;
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc || pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await get()._flushRemoteIceCandidates(pc, call.callId);
      });
      if (get().pc !== pc) return;
      if (get().call?.status !== "ringing") return;
      set({ call: { ...get().call, status: "connecting" } });
      if (ringTimer) clearTimeout(ringTimer);
      ringTimer = null;
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (get().call?.callId === call.callId && get().call?.status === "connecting") {
          get().endCall("connection-failed");
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (error) {
      console.error("Error applying call answer:", error);
    }
  },

  // Renegotiation offer (ICE restart after a network drop). Only reached by
  // the callee: the original caller drives the restart, see _attemptIceRestart.
  _handleRemoteOffer: async (data) => {
    const { call, pc } = get();
    if (!call || call.callId !== data.callId || call.direction !== "incoming" || !pc) return;
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc || pc.signalingState !== "stable") return;
        const iceServers = await getIceServers();
        if (get().pc !== pc) return;
        pc.setConfiguration({ ...PEER_CONNECTION_OPTIONS, iceServers: copyIceServers(iceServers) });
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (get().pc !== pc) return;
        await get()._flushRemoteIceCandidates(pc, call.callId);
        if (get().pc !== pc) return;
        const answer = await pc.createAnswer();
        if (get().pc !== pc) return;
        const description = new RTCSessionDescription(answer);
        await pc.setLocalDescription(description);
        if (get().pc !== pc) return;
        get()._emitSignal("call:answer", {
          conversationId: call.conversationId,
          callId: call.callId,
          sdp: description,
        }, true);
      });
    } catch (error) {
      console.error("Error applying renegotiation offer:", error);
    }
  },

  _beginRecovery: (callId, immediate = false) => {
    const { call } = get();
    if (!call || call.callId !== callId) return;
    if (call.status !== "reconnecting") set({ call: { ...call, status: "reconnecting" } });
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (get().call?.callId === callId) get().endCall("connection-lost");
      }, RECONNECT_TIMEOUT_MS);
    }
    if (call.direction === "outgoing" && !iceRestartTimer && !iceRestartInFlight) {
      const delay = immediate ? 0 : Math.min(8000, 2000 * 2 ** iceRestartAttempts);
      iceRestartTimer = setTimeout(() => {
        iceRestartTimer = null;
        get()._attemptIceRestart(callId);
      }, delay);
    }
  },

  _attemptIceRestart: async (callId) => {
    const { call, pc } = get();
    if (!call || call.callId !== callId || call.direction !== "outgoing" || !pc || iceRestartInFlight) return;
    iceRestartInFlight = true;
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc || pc.signalingState !== "stable" || !get().socket?.connected) return;
        const iceServers = await getIceServers();
        if (get().pc !== pc) return;
        pc.setConfiguration({ ...PEER_CONNECTION_OPTIONS, iceServers: copyIceServers(iceServers) });
        const offer = await pc.createOffer({ iceRestart: true });
        if (get().pc !== pc) return;
        const description = new RTCSessionDescription(offer);
        await pc.setLocalDescription(description);
        if (get().pc !== pc) return;
        get()._emitSignal("call:offer", {
          conversationId: call.conversationId,
          callId: call.callId,
          sdp: description,
        }, true);
        iceRestartAttempts += 1;
      });
    } catch (error) {
      console.error("Error attempting ICE restart:", error);
    } finally {
      if (get().pc === pc) {
        iceRestartInFlight = false;
        if (get().call?.status === "reconnecting") get()._beginRecovery(callId);
      }
    }
  },

  _handleRemoteIceCandidate: async (data) => {
    const { call, pc } = get();
    if (!data.callId || !data.candidate) return;
    if (!call || call.callId !== data.callId) {
      queueEarlyIceCandidate(data.callId, data.candidate);
      return;
    }
    if (!pc || !pc.remoteDescription) {
      set((state) => ({
        pendingIceCandidates: [...state.pendingIceCandidates, data.candidate].slice(-256),
      }));
      return;
    }
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc) return;
        if (!candidateMatchesDescription(data.candidate, pc.remoteDescription)) {
          set((state) => ({
            pendingIceCandidates: [...state.pendingIceCandidates, data.candidate].slice(-256),
          }));
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      });
    } catch (error) {
      if (get().pc === pc && pc.connectionState !== "closed") {
        console.error("Error adding ICE candidate:", error);
      }
    }
  },

  _flushRemoteIceCandidates: async (pc, callId) => {
    const candidates = get().pendingIceCandidates.filter((candidate) => candidateMatchesDescription(candidate, pc.remoteDescription));
    set((state) => ({
      pendingIceCandidates: state.pendingIceCandidates.filter((candidate) => !candidateMatchesDescription(candidate, pc.remoteDescription)),
    }));
    for (const candidate of candidates) {
      if (get().pc !== pc || get().call?.callId !== callId) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        if (get().pc === pc && pc.connectionState !== "closed") {
          console.error("Error flushing ICE candidate:", error);
        }
      }
    }
  },

  _handleRemoteDecline: (data) => {
    const { call } = get();
    if (!call || call.callId !== data.callId) return;
    endNativeCall(call.callId, data.reason || "remote");
    get()._teardown();
    set({ call: { ...call, status: "declined" }, pendingOffer: null });
    setTimeout(() => {
      if (get().call?.callId === data.callId) set({ call: null });
    }, 2000);
  },

  _handleRemoteEnd: (data) => {
    const { call } = get();
    if (!call || call.callId !== data.callId) return;
    endNativeCall(call.callId, data.reason || "remote");
    get()._teardown();
    set({ call: { ...call, status: "ended" }, pendingOffer: null });
    setTimeout(() => {
      if (get().call?.callId === data.callId) set({ call: null });
    }, 1500);
  },

  endCall: (reason = "local") => {
    if (typeof reason !== "string") reason = "local";
    const { call } = get();
    if (call) {
      endNativeCall(call.callId);
      get()._emitSignal("call:end", {
        conversationId: call.conversationId,
        callId: call.callId,
      });
    }
    get()._teardown();
    set({
      call: call && reason !== "local" ? { ...call, status: "ended", endReason: reason } : null,
      pendingOffer: null,
    });
    if (call && reason !== "local") {
      setTimeout(() => {
        if (get().call?.callId === call.callId) set({ call: null });
      }, 2500);
    }
  },

  toggleMute: async () => {
    const { call, pc, audioSender, localStream, isMuted, microphoneUnavailable, isRestoringMicrophone } = get();
    if (isRestoringMicrophone) return false;
    if (microphoneUnavailable) {
      if (!pc || !audioSender || !localStream) return false;
      set({ isRestoringMicrophone: true });
      let replacement;
      try {
        replacement = await captureLocalMedia("audio");
        const track = replacement.getAudioTracks()[0];
        if (!track) throw new Error("Microphone capture returned no audio track");
        if (get().pc !== pc) return false;
        await audioSender.replaceTrack(track);
        if (audioSender.track !== track) throw new Error("Unable to replace the microphone");
        if (get().pc !== pc) return false;
        localStream.getAudioTracks().forEach((old) => {
          old.onended = null;
          old.stop();
          localStream.removeTrack(old);
        });
        localStream.addTrack(track);
        get()._watchLocalTrack(pc, localStream, track);
        set({ isMuted: false, microphoneUnavailable: false });
        replacement = null;
        setNativeCallMuted(call.callId, false);
        get()._publishMediaState();
        get()._applyInitialAudioParameters(audioSender);
        return true;
      } catch (error) {
        if (get().pc !== pc) return false;
        throw error;
      } finally {
        replacement?.getTracks().forEach((track) => track.stop());
        if (get().pc === pc) set({ isRestoringMicrophone: false });
      }
    }
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });
    const muted = !isMuted;
    set({ isMuted: muted });
    if (call) setNativeCallMuted(call.callId, muted);
    get()._publishMediaState();
  },

  toggleCamera: async () => {
    const { call, pc, localStream, videoSender, isCameraOff, isChangingMedia, isScreenSharing } = get();
    if (!call || call.status !== "connected" || !videoSender || !localStream || isChangingMedia || isScreenSharing) return false;
    set({ isChangingMedia: true });
    let cameraStream;
    try {
      if (!isCameraOff) {
        await replaceVideoTrack(videoSender, null);
        localStream.getVideoTracks().forEach((track) => {
          track.onended = null;
          localStream.removeTrack(track);
          track.stop();
        });
        if (get().pc === pc) {
          set({ isCameraOff: true });
          get()._publishMediaState();
        }
        return;
      }
      await requestCallPermissions("camera");
      cameraStream = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("Camera capture returned no video track");
      if (get().pc !== pc) return;
      if ("contentHint" in cameraTrack) cameraTrack.contentHint = "motion";
      await replaceVideoTrack(videoSender, cameraTrack);
      if (get().pc !== pc) return;
      localStream.addTrack(cameraTrack);
      get()._watchLocalTrack(pc, localStream, cameraTrack);
      set({ isCameraOff: false });
      get()._publishMediaState();
      cameraStream = null;
      get()._applyInitialVideoParameters(videoSender);
    } catch (error) {
      if (get().pc !== pc) return false;
      throw error;
    } finally {
      cameraStream?.getTracks().forEach((track) => track.stop());
      if (get().pc === pc) set({ isChangingMedia: false });
    }
  },

  switchCamera: () => {
    get().localStream?.getVideoTracks().forEach((track) => track._switchCamera?.());
  },

  startScreenShare: async () => {
    const { call, pc, videoSender, isScreenSharing, isChangingMedia } = get();
    if (
      !isScreenSharingSupported ||
      isScreenSharing ||
      call?.status !== "connected" ||
      !videoSender ||
      isChangingMedia
    ) {
      return false;
    }

    set({ isChangingMedia: true });
    let screenStream;
    try {
      screenStream = await mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15, max: 15 },
        },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("Screen capture returned no video track");
      if (get().pc !== pc) return false;
      if ("contentHint" in screenTrack) screenTrack.contentHint = "detail";
      await replaceVideoTrack(videoSender, screenTrack);
      if (get().pc !== pc) return false;
      const activeStream = screenStream;
      screenTrack.onended = () => {
        if (get().screenStream === activeStream) {
          get().stopScreenShare().catch((error) => console.error("Unable to stop screen sharing:", error));
        }
      };
      set({ screenStream, isScreenSharing: true });
      get()._publishMediaState();
      if (screenTrack.readyState === "ended") {
        set({ isChangingMedia: false });
        await get().stopScreenShare();
      }
      screenStream = null;
      get()._applyInitialVideoParameters(videoSender);
      return true;
    } catch (error) {
      if (get().pc !== pc) return false;
      throw error;
    } finally {
      screenStream?.getTracks().forEach((track) => track.stop());
      if (get().pc === pc) set({ isChangingMedia: false });
    }
  },

  stopScreenShare: async () => {
    const { pc, videoSender, screenStream, localStream, isCameraOff, isChangingMedia } = get();
    if (isChangingMedia) return false;
    if (!screenStream) return;
    set({ isChangingMedia: true });
    const cameraTrack = !isCameraOff
      ? localStream?.getVideoTracks().find((track) => track.readyState === "live") || null
      : null;
    let restored = false;
    try {
      await replaceVideoTrack(videoSender, cameraTrack);
      restored = true;
    } catch (error) {
      if (get().pc !== pc) return false;
      throw error;
    } finally {
      screenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      if (get().pc === pc) {
        if (!restored) {
          localStream?.getVideoTracks().forEach((track) => {
            track.onended = null;
            track.stop();
            localStream.removeTrack(track);
          });
        }
        set({
          screenStream: null, isScreenSharing: false, isChangingMedia: false,
          isCameraOff: !restored || !cameraTrack,
        });
        get()._publishMediaState();
        if (cameraTrack && videoSender.track === cameraTrack) get()._applyInitialVideoParameters(videoSender);
      }
    }
  },

  // Video calls default to the loudspeaker (holding a phone to your ear to
  // watch video makes no sense); voice calls default to the earpiece, same
  // as FaceTime, with a manual toggle for either.
  _startAudioRoute: (callType) => {
    const speakerOn = callType === "video";
    InCallManager.start({ media: callType === "video" ? "video" : "audio" });
    InCallManager.setKeepScreenOn(callType === "video");
    InCallManager.setForceSpeakerphoneOn(null);
    set({ isSpeakerOn: speakerOn });
    get()._attachAppStateHandling();
  },

  toggleSpeaker: () => {
    const { isSpeakerOn } = get();
    const next = !isSpeakerOn;
    InCallManager.setForceSpeakerphoneOn(next);
    set({ isSpeakerOn: next });
  },

  setMinimized: (minimized) => set({ minimized }),

  _teardown: () => {
    const { call, pc, localStream, remoteStream, screenStream, mediaStateChannel } = get();
    callEpoch += 1;
    if (call?.callId) earlyIceCandidates.delete(call.callId);
    clearReconnectTimer();
    clearSetupTimers();
    clearQualityMonitor();
    negotiationChain = Promise.resolve();
    iceRestartInFlight = false;
    appStateSubscription?.remove();
    appStateSubscription = null;
    wasAutoPaused = false;
    localStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    remoteStream?.getTracks().forEach((track) => {
      track.onmute = null;
      track.onunmute = null;
      track.onended = null;
    });
    screenStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (mediaStateChannel) {
      mediaStateChannel.onopen = null;
      mediaStateChannel.onmessage = null;
      mediaStateChannel.onerror = null;
      mediaStateChannel.onclose = null;
      mediaStateChannel.close();
    }
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
    }
    InCallManager.setKeepScreenOn(false);
    InCallManager.stop();
    set({
      pc: null,
      localStream: null,
      remoteStream: null,
      screenStream: null,
      isMuted: false,
      isCameraOff: true,
      isScreenSharing: false,
      isChangingMedia: false,
      isRestoringMicrophone: false,
      microphoneUnavailable: false,
      isStartingCall: false,
      remoteVideoActive: false,
      remoteMediaState: null,
      mediaStateChannel: null,
      isSpeakerOn: false,
      networkQuality: "good",
      minimized: false,
      audioSender: null,
      videoSender: null,
      pendingIceCandidates: [],
    });
  },
}));
