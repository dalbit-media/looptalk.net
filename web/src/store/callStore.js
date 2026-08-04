import { create } from "zustand";
import { AppState } from "react-native";
import { api } from "../api/client";
import { useAuthStore } from "./authStore";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  isCallingSupported,
  isVideoCallingSupported,
  isScreenSharingSupported,
} from "../utils/webrtc";
import InCallManager from "../utils/inCallManager";
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
let cachedIceConfiguration = null;

const getIceServers = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedIceConfiguration?.expiresAt > now + 60) {
    return cachedIceConfiguration.iceServers;
  }
  const token = useAuthStore.getState().token;
  if (!token) return FALLBACK_ICE_SERVERS;
  try {
    const { data } = await api.get("/calls/ice-servers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    cachedIceConfiguration = data;
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

// Real (not just "on/off") audio processing and a real target resolution/
// frame rate are what separate a call that merely works from one that
// sounds and looks like FaceTime.
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
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false,
});

const captureLocalMedia = async (callType, facingMode = "user") => {
  try {
    return await mediaDevices.getUserMedia(buildMediaConstraints(callType, facingMode));
  } catch (error) {
    const constraintFailure = [
      "OverconstrainedError",
      "ConstraintNotSatisfiedError",
      "TypeError",
    ].includes(error?.name);
    if (!constraintFailure) throw error;
    return mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video" ? { facingMode } : false,
    });
  }
};

// --- SDP tuning applied to every locally-created offer/answer -------------
// Each peer's own local description controls how *it* encodes, so this is
// applied on both the caller's offer and the callee's answer (and again on
// ICE-restart renegotiation) to keep both directions optimized.

// H.264 has hardware encode/decode on effectively all iOS and modern Android
// devices, keeping CPU/battery use down and framerate stable — the same
// tradeoff FaceTime makes over a software VP8 fallback.
const preferCodecInSdp = (sdp, kind, codecName) => {
  const lines = sdp.split("\r\n");
  const mLineIndex = lines.findIndex((line) => line.startsWith(`m=${kind}`));
  if (mLineIndex === -1) return sdp;

  const codecRegex = new RegExp(`^a=rtpmap:(\\d+) ${codecName}/`, "i");
  const preferredPayloads = lines
    .filter((line) => codecRegex.test(line))
    .map((line) => line.match(codecRegex)[1]);
  if (!preferredPayloads.length) return sdp;

  const mLineTokens = lines[mLineIndex].split(" ");
  const header = mLineTokens.slice(0, 3);
  const payloads = mLineTokens.slice(3);
  const reordered = [
    ...preferredPayloads.filter((pt) => payloads.includes(pt)),
    ...payloads.filter((pt) => !preferredPayloads.includes(pt)),
  ];
  lines[mLineIndex] = [...header, ...reordered].join(" ");
  return lines.join("\r\n");
};

// Opus in-band FEC (packet-loss resilience without retransmission) and DTX
// (near-zero bandwidth while silent) keep calls clear on lossy Wi-Fi/cellular
// instead of just capping a bitrate.
const tuneOpusInSdp = (sdp) => {
  const lines = sdp.split("\r\n");
  const rtpmapIndex = lines.findIndex((line) => /^a=rtpmap:\d+ opus\/48000/i.test(line));
  if (rtpmapIndex === -1) return sdp;

  const payload = lines[rtpmapIndex].match(/^a=rtpmap:(\d+)/)[1];
  const desiredParams = {
    maxaveragebitrate: "48000",
    maxplaybackrate: "48000",
    useinbandfec: "1",
    usedtx: "1",
    stereo: "0",
    "sprop-stereo": "0",
  };
  const fmtpIndex = lines.findIndex((line) => line.startsWith(`a=fmtp:${payload}`));
  const prefix = `a=fmtp:${payload}`;
  const params = new Map();
  if (fmtpIndex !== -1) {
    lines[fmtpIndex]
      .slice(prefix.length)
      .trim()
      .split(";")
      .filter(Boolean)
      .forEach((entry) => {
        const [key, value = ""] = entry.split("=");
        params.set(key.toLowerCase(), value);
      });
  }
  Object.entries(desiredParams).forEach(([key, value]) => params.set(key, value));
  const serialized = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
  const fmtpLine = `${prefix} ${serialized}`;
  if (fmtpIndex !== -1) lines[fmtpIndex] = fmtpLine;
  else lines.splice(rtpmapIndex + 1, 0, fmtpLine);
  return lines.join("\r\n");
};

const optimizeSdp = (sdp, callType) => {
  let optimized = tuneOpusInSdp(sdp);
  if (callType === "video") {
    optimized = preferCodecInSdp(optimized, "video", "H264");
  }
  return optimized;
};

// Available-bandwidth-driven ladder for the outgoing video encoding — steps
// resolution/bitrate down under a weak network and back up once it recovers,
// instead of a fixed cap that either stutters or wastes bandwidth.
const VIDEO_BITRATE_TIERS = [
  { minAvailableBps: 1200000, maxBitrate: 1500000, scaleResolutionDownBy: 1 },
  { minAvailableBps: 600000, maxBitrate: 800000, scaleResolutionDownBy: 1 },
  { minAvailableBps: 250000, maxBitrate: 400000, scaleResolutionDownBy: 1.5 },
  { minAvailableBps: 0, maxBitrate: 150000, scaleResolutionDownBy: 2 },
];

const pickVideoTier = (availableBps) =>
  VIDEO_BITRATE_TIERS.find((tier) => availableBps >= tier.minAvailableBps) ||
  VIDEO_BITRATE_TIERS[VIDEO_BITRATE_TIERS.length - 1];

const QUALITY_MONITOR_INTERVAL_MS = 4000;
let qualityMonitorTimer = null;
let previousAudioStats = null;
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

// Grace period before a dropped connection is treated as a real hangup
// rather than a transient network blip (matches how FaceTime keeps a call
// alive through brief Wi-Fi/cellular handoffs instead of ending instantly).
const RECONNECT_TIMEOUT_MS = 15000;

let reconnectTimer = null;
let negotiationChain = Promise.resolve();
let lastIceRestartAt = 0;
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
  isCameraOff: false,
  isScreenSharing: false,
  isSpeakerOn: false,
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
    if (
      current?.status === "reconnecting" &&
      current.direction === "outgoing" &&
      pc?.connectionState !== "connected"
    ) {
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
      iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 4,
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
      if (!current || current.callId !== callId) return;

      if (pc.connectionState === "connected") {
        clearReconnectTimer();
        clearSetupTimers();
        set({ call: { ...current, status: "connected" } });
        markNativeCallActive(callId);
        get()._startQualityMonitor(callId);
        return;
      }

      // Transient drops (Wi-Fi <-> cellular handoff, brief signal loss) get a
      // grace period with an ICE restart attempt instead of an instant hangup.
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        if (current.status !== "reconnecting") {
          set({ call: { ...current, status: "reconnecting" } });
        }
        if (current.direction === "outgoing" && pc.connectionState === "failed") {
          get()._attemptIceRestart(callId);
        }
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (get().call?.callId === callId) get().endCall();
          }, RECONNECT_TIMEOUT_MS);
        }
      }
    };
    pc.oniceconnectionstatechange = () => {
      const current = get().call;
      if (!current || current.callId !== callId) return;
      if (pc.iceConnectionState === "failed") {
        if (current.status !== "reconnecting") {
          set({ call: { ...current, status: "reconnecting" } });
        }
        if (current.direction === "outgoing") get()._attemptIceRestart(callId);
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (get().call?.callId === callId) get().endCall();
          }, RECONNECT_TIMEOUT_MS);
        }
      }
    };
    pc.ontrack = (event) => {
      set({ remoteStream: event.streams[0] });
    };
    return pc;
  },

  // Bitrate cap + degradation preference so a weak link drops resolution/
  // bitrate smoothly ("balanced") instead of stalling framerate.
  _applyInitialVideoParameters: async (sender) => {
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = VIDEO_BITRATE_TIERS[0].maxBitrate;
      params.encodings[0].maxFramerate = 30;
      params.degradationPreference = "balanced";
      await sender.setParameters(params);
    } catch (error) {
      console.warn("Unable to apply initial video parameters:", error);
    }
  },

  _applyInitialAudioParameters: async (sender) => {
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = 48000;
      await sender.setParameters(params);
    } catch (error) {
      console.warn("Unable to apply initial audio parameters:", error);
    }
  },

  // Samples the real available bandwidth from getStats() and steps the
  // outgoing video encoding up/down accordingly, instead of a fixed cap.
  _startQualityMonitor: (callId) => {
    clearQualityMonitor();
    qualityMonitorTimer = setInterval(async () => {
      const { call, pc, audioSender, videoSender } = get();
      if (!call || call.callId !== callId || !pc || call.status !== "connected") return;
      try {
        const stats = await pc.getStats();
        let availableBps = null;
        let roundTripTime = null;
        let inboundAudio = null;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            if (report.availableOutgoingBitrate) {
              availableBps = report.availableOutgoingBitrate;
            }
            if (Number.isFinite(report.currentRoundTripTime)) {
              roundTripTime = report.currentRoundTripTime;
            }
          }
          if (
            report.type === "inbound-rtp" &&
            (report.kind === "audio" || report.mediaType === "audio")
          ) {
            inboundAudio = report;
          }
        });

        let lossRate = 0;
        if (inboundAudio && previousAudioStats) {
          const received = inboundAudio.packetsReceived - previousAudioStats.packetsReceived;
          const lost = inboundAudio.packetsLost - previousAudioStats.packetsLost;
          if (received + lost > 0) lossRate = Math.max(0, lost / (received + lost));
        }
        if (inboundAudio) {
          previousAudioStats = {
            packetsReceived: inboundAudio.packetsReceived || 0,
            packetsLost: inboundAudio.packetsLost || 0,
          };
        }

        const jitter = inboundAudio?.jitter || 0;
        const networkQuality =
          lossRate > 0.08 || roundTripTime > 0.5 || jitter > 0.05
            ? "poor"
            : lossRate > 0.03 || roundTripTime > 0.25 || jitter > 0.03
              ? "fair"
              : "good";
        if (get().networkQuality !== networkQuality) set({ networkQuality });

        if (audioSender) {
          const targetBitrate =
            networkQuality === "poor" || (availableBps && availableBps < 45000)
              ? 20000
              : networkQuality === "fair" || (availableBps && availableBps < 90000)
                ? 32000
                : 48000;
          const params = audioSender.getParameters();
          params.encodings = params.encodings?.length ? params.encodings : [{}];
          if (params.encodings[0].maxBitrate !== targetBitrate) {
            params.encodings[0].maxBitrate = targetBitrate;
            await audioSender.setParameters(params);
          }
        }

        if (videoSender && availableBps != null) {
          const tier = pickVideoTier(availableBps);
          const params = videoSender.getParameters();
          params.encodings = params.encodings?.length ? params.encodings : [{}];
          params.encodings[0].maxBitrate = tier.maxBitrate;
          params.encodings[0].scaleResolutionDownBy = tier.scaleResolutionDownBy;
          await videoSender.setParameters(params);
        }
      } catch (error) {
        console.warn("Quality monitor error:", error);
      }
    }, QUALITY_MONITOR_INTERVAL_MS);
  },

  // Auto-pauses the camera while backgrounded (saves encode CPU/battery) and
  // resumes it on return, without overriding the user's own camera toggle.
  _attachAppStateHandling: () => {
    appStateSubscription?.remove();
    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const { call, localStream, isCameraOff } = get();
      if (!call || call.callType !== "video" || !localStream) return;
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
    });
  },

  startCall: async (conversationId, callType, peerUser) => {
    if (!isCallingSupported) {
      throw new Error("Calling is not supported on this platform");
    }
    if (callType === "video" && !isVideoCallingSupported) {
      throw new Error("Video calling is not supported on this platform");
    }
    if (get().call) return;
    if (!get().socket?.connected) {
      throw new Error("Call signaling is offline");
    }

    const callId = generateCallId();
    set({
      call: {
        callId,
        conversationId,
        callType,
        direction: "outgoing",
        status: "ringing",
        peerUser,
      },
      pendingIceCandidates: [],
    });
    startNativeOutgoingCall(get().call);
    ringTimer = setTimeout(() => {
      ringTimer = null;
      if (get().call?.callId === callId && get().call?.status === "ringing") {
        get().endCall();
      }
    }, RING_TIMEOUT_MS);

    try {
      const localStream = await captureLocalMedia(callType);
      if (get().call?.callId !== callId) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      set({ localStream });
      get()._startAudioRoute(callType);

      const pc = await get()._createPeerConnection(conversationId, callId);
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      set({ pc });

      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
      if (audioSender) {
        set({ audioSender });
        await get()._applyInitialAudioParameters(audioSender);
      }
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === "video");
      if (videoSender) {
        set({ videoSender });
        await get()._applyInitialVideoParameters(videoSender);
      }

      const offer = await pc.createOffer();
      const optimizedOffer = new RTCSessionDescription({
        type: offer.type,
        sdp: optimizeSdp(offer.sdp, callType),
      });
      await pc.setLocalDescription(optimizedOffer);

      get()._emitSignal(
        "call:invite",
        { conversationId, callId, callType, sdp: optimizedOffer },
        true
      );
    } catch (error) {
      console.error("Error starting call:", error);
      get()._teardown();
      set({ call: null });
      throw error;
    }
  },

  _handleIncoming: (data) => {
    if (data.callType === "video" && !isVideoCallingSupported) {
      earlyIceCandidates.delete(data.callId);
      get()._emitSignal("call:decline", {
        conversationId: data.conversationId,
        callId: data.callId,
        reason: "unsupported",
      });
      return;
    }
    if (get().call?.callId === data.callId) {
      set({ pendingOffer: data.sdp });
      return;
    }
    if (get().call) {
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
    }, RING_TIMEOUT_MS);
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
    get().localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    set({ isMuted: muted });
  },

  acceptCall: async () => {
    const { call, pendingOffer } = get();
    if (
      !call ||
      call.direction !== "incoming" ||
      call.status !== "ringing" ||
      !pendingOffer
    ) return;
    if (!get().socket?.connected) return;

    try {
      if (ringTimer) clearTimeout(ringTimer);
      ringTimer = null;
      set({ call: { ...call, status: "connecting" } });
      answerNativeCall(call.callId);
      const localStream = await captureLocalMedia(call.callType);
      if (get().call?.callId !== call.callId) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      set({ localStream });
      get()._startAudioRoute(call.callType);

      const pc = await get()._createPeerConnection(call.conversationId, call.callId);
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      set({ pc });

      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
      if (audioSender) {
        set({ audioSender });
        await get()._applyInitialAudioParameters(audioSender);
      }
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === "video");
      if (videoSender) {
        set({ videoSender });
        await get()._applyInitialVideoParameters(videoSender);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      await get()._flushRemoteIceCandidates(pc, call.callId);
      const answer = await pc.createAnswer();
      const optimizedAnswer = new RTCSessionDescription({
        type: answer.type,
        sdp: optimizeSdp(answer.sdp, call.callType),
      });
      await pc.setLocalDescription(optimizedAnswer);

      get()._emitSignal("call:answer", {
        conversationId: call.conversationId,
        callId: call.callId,
        sdp: optimizedAnswer,
      }, true);
      set({ pendingOffer: null });
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (get().call?.callId === call.callId && get().call?.status === "connecting") {
          get().endCall();
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (error) {
      console.error("Error accepting call:", error);
      get().declineCall();
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
        if (get().pc !== pc || pc.signalingState === "closed") return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await get()._flushRemoteIceCandidates(pc, call.callId);
      });
      set({ call: { ...call, status: "connecting" } });
      if (ringTimer) clearTimeout(ringTimer);
      ringTimer = null;
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (get().call?.callId === call.callId && get().call?.status === "connecting") {
          get().endCall();
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
    if (!call || call.callId !== data.callId || !pc) return;
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc || pc.signalingState === "closed") return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await get()._flushRemoteIceCandidates(pc, call.callId);
        const answer = await pc.createAnswer();
        const optimizedAnswer = new RTCSessionDescription({
          type: answer.type,
          sdp: optimizeSdp(answer.sdp, call.callType),
        });
        await pc.setLocalDescription(optimizedAnswer);
        get()._emitSignal("call:answer", {
          conversationId: call.conversationId,
          callId: call.callId,
          sdp: optimizedAnswer,
        }, true);
      });
    } catch (error) {
      console.error("Error applying renegotiation offer:", error);
    }
  },

  _attemptIceRestart: async (callId) => {
    const { call, pc } = get();
    if (!call || call.callId !== callId || !pc || !get().socket?.connected) return;
    if (Date.now() - lastIceRestartAt < 3000) return;
    lastIceRestartAt = Date.now();
    try {
      await get()._runNegotiation(async () => {
        if (get().pc !== pc || pc.signalingState !== "stable") return;
        const offer = await pc.createOffer({ iceRestart: true });
        const optimizedOffer = new RTCSessionDescription({
          type: offer.type,
          sdp: optimizeSdp(offer.sdp, call.callType),
        });
        await pc.setLocalDescription(optimizedOffer);
        get()._emitSignal("call:offer", {
          conversationId: call.conversationId,
          callId: call.callId,
          sdp: optimizedOffer,
        }, true);
      });
    } catch (error) {
      console.error("Error attempting ICE restart:", error);
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
      if (get().pc !== pc) return;
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      if (get().pc === pc && pc.connectionState !== "closed") {
        console.error("Error adding ICE candidate:", error);
      }
    }
  },

  _flushRemoteIceCandidates: async (pc, callId) => {
    const candidates = get().pendingIceCandidates;
    set({ pendingIceCandidates: [] });
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

  endCall: () => {
    const { call } = get();
    if (call) {
      endNativeCall(call.callId);
      get()._emitSignal("call:end", {
        conversationId: call.conversationId,
        callId: call.callId,
      });
    }
    get()._teardown();
    set({ call: null, pendingOffer: null });
  },

  toggleMute: () => {
    const { call, localStream, isMuted } = get();
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });
    const muted = !isMuted;
    set({ isMuted: muted });
    if (call) setNativeCallMuted(call.callId, muted);
  },

  toggleCamera: () => {
    const { localStream, isCameraOff } = get();
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = isCameraOff;
    });
    set({ isCameraOff: !isCameraOff });
  },

  switchCamera: () => {
    get().localStream?.getVideoTracks().forEach((track) => track._switchCamera?.());
  },

  startScreenShare: async () => {
    const { call, videoSender, localStream, isScreenSharing } = get();
    if (
      !isScreenSharingSupported ||
      isScreenSharing ||
      call?.callType !== "video" ||
      call.status !== "connected" ||
      !videoSender ||
      !localStream
    ) {
      return false;
    }

    const screenStream = await mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 15, max: 30 },
      },
      audio: false,
    });
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      screenStream.getTracks().forEach((track) => track.stop());
      return false;
    }

    const cameraTrack = localStream.getVideoTracks()[0] || null;
    await videoSender.replaceTrack(screenTrack);
    screenTrack.onended = () => {
      if (get().screenStream === screenStream) get().stopScreenShare();
    };
    set({
      screenStream,
      isScreenSharing: true,
      screenShareCameraTrack: cameraTrack,
    });
    return true;
  },

  stopScreenShare: async () => {
    const { videoSender, screenStream, screenShareCameraTrack, localStream } = get();
    if (!screenStream) return;
    const cameraTrack =
      screenShareCameraTrack?.readyState === "live"
        ? screenShareCameraTrack
        : localStream?.getVideoTracks().find((track) => track.readyState === "live") || null;
    try {
      if (videoSender && cameraTrack) await videoSender.replaceTrack(cameraTrack);
    } finally {
      screenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      set({ screenStream: null, isScreenSharing: false, screenShareCameraTrack: null });
    }
  },

  // Video calls default to the loudspeaker (holding a phone to your ear to
  // watch video makes no sense); voice calls default to the earpiece, same
  // as FaceTime, with a manual toggle for either.
  _startAudioRoute: (callType) => {
    const speakerOn = callType === "video";
    InCallManager.start({ media: callType === "video" ? "video" : "audio" });
    InCallManager.setKeepScreenOn(true);
    InCallManager.setForceSpeakerphoneOn(speakerOn);
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
    const { call, pc, localStream, screenStream } = get();
    if (call?.callId) earlyIceCandidates.delete(call.callId);
    clearReconnectTimer();
    clearSetupTimers();
    clearQualityMonitor();
    previousAudioStats = null;
    negotiationChain = Promise.resolve();
    lastIceRestartAt = 0;
    appStateSubscription?.remove();
    appStateSubscription = null;
    wasAutoPaused = false;
    localStream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
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
      isCameraOff: false,
      isScreenSharing: false,
      screenShareCameraTrack: null,
      isSpeakerOn: false,
      networkQuality: "good",
      minimized: false,
      audioSender: null,
      videoSender: null,
      pendingIceCandidates: [],
    });
  },
}));
