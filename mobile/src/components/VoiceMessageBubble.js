import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useAppTheme } from "../hooks/useAppTheme";

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export const VoiceMessageBubble = ({ uri, duration, isOwn }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors, isOwn);
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const handleToggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) {
      player.seekTo(0);
    }
    player.play();
  };

  const progress = status.duration ? Math.min(status.currentTime / status.duration, 1) : 0;
  const displayDuration = status.duration ? status.duration * 1000 : duration;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleToggle} style={styles.playButton}>
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={18}
          color={isOwn ? "#fff" : colors.primary}
        />
      </TouchableOpacity>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.durationText}>{formatDuration(displayDuration)}</Text>
    </View>
  );
};

const createStyles = (colors, isOwn) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      minWidth: 160,
      gap: 8,
    },
    playButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isOwn ? "rgba(255,255,255,0.25)" : colors.primarySoft,
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: isOwn ? "rgba(255,255,255,0.35)" : colors.border,
      overflow: "hidden",
    },
    trackFill: {
      height: "100%",
      backgroundColor: isOwn ? "#fff" : colors.primary,
    },
    durationText: {
      fontSize: 11,
      color: isOwn ? "#fff" : colors.secondaryText,
      minWidth: 34,
    },
  });
