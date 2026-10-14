import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
} from "expo-audio";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

const formatTime = (total) => {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// Tap-to-record bar (replaces the text composer while active): tap the mic to
// start, then either send (checkmark) or discard (trash) the recording.
export const VoiceRecorderBar = ({ onCancel, onSend }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  useAudioRecorderState(audioRecorder, 200);

  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        onCancel(t("messages.microphonePermissionDenied"));
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      if (cancelled) return;
      audioRecorder.record();
      startedRef.current = true;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (startedRef.current) {
        audioRecorder.stop().catch(() => {});
        startedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [ready]);

  const handleCancel = async () => {
    if (startedRef.current) {
      await audioRecorder.stop().catch(() => {});
      startedRef.current = false;
    }
    onCancel();
  };

  const handleSend = async () => {
    if (!ready || seconds < 1) {
      await handleCancel();
      onCancel(t("messages.recordingTooShort"));
      return;
    }
    try {
      await audioRecorder.stop();
      startedRef.current = false;
      onSend(audioRecorder.uri, seconds * 1000);
    } catch (error) {
      console.error("Error stopping recording:", error);
      onCancel(t("messages.mediaUploadFailed"));
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.iconButton} onPress={handleCancel}>
        <Ionicons name="trash" size={22} color={colors.danger} />
      </TouchableOpacity>

      <View style={styles.middle}>
        <View style={styles.recordingDot} />
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <Text style={styles.hintText}>{t("messages.recording")}</Text>
      </View>

      <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
        <Ionicons name="send" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    iconButton: {
      padding: 8,
    },
    middle: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.input,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    recordingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.danger,
    },
    timerText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 14,
    },
    hintText: {
      color: colors.mutedText,
      fontSize: 13,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
  });
