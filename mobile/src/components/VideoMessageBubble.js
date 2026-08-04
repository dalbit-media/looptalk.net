import React from "react";
import { StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export const VideoMessageBubble = ({ uri, thumbnailUri }) => {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="cover"
      nativeControls
      allowsFullscreen
      posterSource={thumbnailUri ? { uri: thumbnailUri } : undefined}
    />
  );
};

const styles = StyleSheet.create({
  video: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: "#000",
  },
});
