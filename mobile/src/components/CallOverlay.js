import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Vibration,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallStore } from "../store/callStore";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import {
  prepareIncomingRingtone,
  startIncomingRingtone,
  stopIncomingRingtone,
} from "../utils/callRingtone";
import { RemoteAudio } from "./RemoteAudio";
import { VideoStream } from "./VideoStream";
import { showAlert } from "../utils/showAlert";

const RING_PATTERN = [0, 800, 800];

const PIP_WIDTH = 100;
const PIP_HEIGHT = 150;
const PIP_MARGIN = 16;
const PIP_TOP_BOUND = 90;
const PIP_BOTTOM_BOUND = 160;

const formatElapsed = (total) => {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// Global, always-mounted overlay (rendered once from App.js) so incoming and
// in-progress calls stay visible no matter which screen is focused, without
// needing a dedicated navigation route.
export const CallOverlay = () => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const call = useCallStore((state) => state.call);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const screenStream = useCallStore((state) => state.screenStream);
  const isMuted = useCallStore((state) => state.isMuted);
  const isCameraOff = useCallStore((state) => state.isCameraOff);
  const isScreenSharing = useCallStore((state) => state.isScreenSharing);
  const isScreenSharingSupported = useCallStore((state) => state.isScreenSharingSupported);
  const isSpeakerOn = useCallStore((state) => state.isSpeakerOn);
  const networkQuality = useCallStore((state) => state.networkQuality);
  const minimized = useCallStore((state) => state.minimized);
  const acceptCall = useCallStore((state) => state.acceptCall);
  const declineCall = useCallStore((state) => state.declineCall);
  const endCall = useCallStore((state) => state.endCall);
  const toggleMute = useCallStore((state) => state.toggleMute);
  const toggleCamera = useCallStore((state) => state.toggleCamera);
  const switchCamera = useCallStore((state) => state.switchCamera);
  const startScreenShare = useCallStore((state) => state.startScreenShare);
  const stopScreenShare = useCallStore((state) => state.stopScreenShare);
  const toggleSpeaker = useCallStore((state) => state.toggleSpeaker);
  const setMinimized = useCallStore((state) => state.setMinimized);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => prepareIncomingRingtone(), []);

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  const defaultPipPosition = {
    x: screenWidth - PIP_WIDTH - PIP_MARGIN,
    y: PIP_TOP_BOUND,
  };
  const pan = useRef(new Animated.ValueXY(defaultPipPosition)).current;
  const pipPosRef = useRef(defaultPipPosition);

  useEffect(() => {
    const id = pan.addListener((value) => {
      pipPosRef.current = value;
    });
    return () => pan.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pan.setValue(defaultPipPosition);
    pipPosRef.current = defaultPipPosition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.callId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        pan.setOffset(pipPosRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const { x, y } = pipPosRef.current;
        const targetX =
          x + PIP_WIDTH / 2 < screenWidth / 2 ? PIP_MARGIN : screenWidth - PIP_WIDTH - PIP_MARGIN;
        const targetY = Math.min(
          Math.max(y, PIP_TOP_BOUND),
          screenHeight - PIP_BOTTOM_BOUND - PIP_HEIGHT
        );
        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (call?.status === "connected") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    return undefined;
  }, [call?.status]);

  useEffect(() => {
    if (call?.status === "ringing" && call.direction === "incoming") {
      startIncomingRingtone();
      Vibration.vibrate(RING_PATTERN, true);
      return () => {
        stopIncomingRingtone();
        Vibration.cancel();
      };
    }
    stopIncomingRingtone();
    Vibration.cancel();
    return undefined;
  }, [call?.status, call?.direction]);

  if (!call) return null;

  const peerName =
    call.peerUser?.displayName || call.peerUser?.username || t("messages.chat");
  const isIncomingRinging = call.status === "ringing" && call.direction === "incoming";
  const isFinished = call.status === "declined" || call.status === "ended";
  const isReconnecting = call.status === "reconnecting";
  const canMinimize = call.status === "connected" || isReconnecting;
  const showVideo =
    call.callType === "video" &&
    (call.status === "connecting" || call.status === "connected" || isReconnecting);
  const localPreviewStream = isScreenSharing ? screenStream : localStream;

  const handleScreenShare = async () => {
    try {
      if (isScreenSharing) await stopScreenShare();
      else await startScreenShare();
    } catch (error) {
      if (error?.name !== "NotAllowedError") {
        showAlert(t("common.error"), t("calls.screenShareFailed"));
      }
    }
  };

  const statusLabel = () => {
    if (call.status === "declined") return t("calls.declined");
    if (call.status === "ended") return t("calls.ended");
    if (isReconnecting) return t("calls.reconnecting");
    if (call.status === "connected") return formatElapsed(elapsed);
    if (call.status === "connecting") return t("calls.connecting");
    if (call.direction === "outgoing") return t("calls.calling");
    return call.callType === "video"
      ? t("calls.incomingVideoCall")
      : t("calls.incomingAudioCall");
  };

  if (minimized && canMinimize) {
    return (
      <TouchableOpacity
        style={styles.minimizedPill}
        onPress={() => setMinimized(false)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t("calls.returnToCall")}
      >
        <View style={[styles.pillDot, isReconnecting && styles.pillDotWarning]} />
        <Text style={styles.pillText} numberOfLines={1}>
          {peerName} · {statusLabel()}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.container}>
        <RemoteAudio stream={remoteStream} />
        {showVideo && remoteStream ? (
          <VideoStream
            stream={remoteStream}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{peerName[0]?.toUpperCase() || "?"}</Text>
            </View>
          </View>
        )}

        {showVideo && localPreviewStream && (!isCameraOff || isScreenSharing) && (
          <Animated.View
            style={[styles.localVideo, pan.getLayout()]}
            {...panResponder.panHandlers}
          >
            <VideoStream
              stream={localPreviewStream}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror={!isScreenSharing}
            />
          </Animated.View>
        )}

        <View style={styles.infoOverlay} pointerEvents="none">
          <Text style={styles.peerName}>{peerName}</Text>
          <Text style={[styles.statusText, isReconnecting && styles.statusTextWarning]}>
            {statusLabel()}
          </Text>
          {call.status === "connected" && networkQuality !== "good" && (
            <Text style={styles.qualityText}>
              {t(`calls.connection${networkQuality === "poor" ? "Poor" : "Fair"}`)}
            </Text>
          )}
        </View>

        {canMinimize && (
          <TouchableOpacity
            style={styles.minimizeButton}
            onPress={() => setMinimized(true)}
            accessibilityRole="button"
            accessibilityLabel={t("calls.minimizeCall")}
          >
            <Ionicons name="chevron-down" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        {!isFinished && (
          <View style={styles.controls}>
            {isIncomingRinging ? (
              <View style={styles.incomingRow}>
                <TouchableOpacity
                  style={[styles.circleButton, styles.declineButton]}
                  onPress={declineCall}
                >
                  <Ionicons name="call" size={28} color="#fff" style={styles.hangupIcon} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.circleButton, styles.acceptButton]}
                  onPress={acceptCall}
                >
                  <Ionicons name="call" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.activeRow}>
                <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
                  <Ionicons name={isMuted ? "mic-off" : "mic"} size={22} color="#fff" />
                </TouchableOpacity>
                {call.callType === "audio" && (
                  <TouchableOpacity
                    style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
                    onPress={toggleSpeaker}
                    accessibilityLabel={t("calls.speaker")}
                  >
                    <Ionicons
                      name={isSpeakerOn ? "volume-high" : "volume-medium"}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>
                )}
                {call.callType === "video" && (
                  <>
                    {!isScreenSharing && (
                      <TouchableOpacity style={styles.controlButton} onPress={toggleCamera} accessibilityLabel={t("calls.toggleCamera")}>
                        <Ionicons name={isCameraOff ? "videocam-off" : "videocam"} size={22} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {!isScreenSharing && (
                      <TouchableOpacity style={styles.controlButton} onPress={switchCamera} accessibilityLabel={t("calls.switchCamera")}>
                        <Ionicons name="camera-reverse" size={22} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {isScreenSharingSupported && call.status === "connected" && (
                      <TouchableOpacity
                        style={[styles.controlButton, isScreenSharing && styles.controlButtonActive]}
                        onPress={handleScreenShare}
                        accessibilityLabel={t(isScreenSharing ? "calls.stopScreenShare" : "calls.startScreenShare")}
                      >
                        <Ionicons name={isScreenSharing ? "stop-circle" : "desktop-outline"} size={22} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={[styles.circleButton, styles.declineButton]}
                  onPress={endCall}
                >
                  <Ionicons name="call" size={26} color="#fff" style={styles.hangupIcon} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#111114",
      justifyContent: "flex-end",
    },
    avatarWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarText: {
      color: "#fff",
      fontSize: 44,
      fontWeight: "700",
    },
    localVideo: {
      position: "absolute",
      width: 100,
      height: 150,
      borderRadius: 12,
      backgroundColor: "#000",
      overflow: "hidden",
    },
    infoOverlay: {
      position: "absolute",
      top: 90,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    peerName: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "700",
    },
    statusText: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 15,
      marginTop: 8,
    },
    statusTextWarning: {
      color: "#FF9F0A",
      fontWeight: "600",
    },
    qualityText: {
      color: "#FFCC00",
      fontSize: 13,
      marginTop: 5,
    },
    minimizeButton: {
      position: "absolute",
      top: 54,
      left: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    minimizedPill: {
      position: "absolute",
      top: Platform.OS === "ios" ? 54 : 30,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#1C1C1E",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      maxWidth: 220,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    pillDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#34C759",
    },
    pillDotWarning: {
      backgroundColor: "#FF9F0A",
    },
    pillText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "600",
    },
    controls: {
      paddingBottom: 60,
      paddingTop: 24,
    },
    incomingRow: {
      flexDirection: "row",
      justifyContent: "space-evenly",
      alignItems: "center",
    },
    activeRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 20,
    },
    circleButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
    },
    acceptButton: {
      backgroundColor: "#34C759",
    },
    declineButton: {
      backgroundColor: "#FF3B30",
    },
    hangupIcon: {
      transform: [{ rotate: "135deg" }],
    },
    controlButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(255,255,255,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    controlButtonActive: {
      backgroundColor: colors.primary,
    },
  });
