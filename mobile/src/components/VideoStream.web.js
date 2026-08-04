import React, { useEffect, useRef } from "react";
import { View } from "react-native";

export const VideoStream = ({ stream, style, objectFit = "cover", mirror = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.srcObject = stream || null;
    if (stream) video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <View style={style}>
      {React.createElement("video", {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit,
          transform: mirror ? "scaleX(-1)" : undefined,
        },
      })}
    </View>
  );
};