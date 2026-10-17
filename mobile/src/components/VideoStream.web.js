import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { attachMediaPlayback } from "../utils/mediaPlayback";

export const VideoStream = ({ stream, style, objectFit = "cover", mirror = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    return attachMediaPlayback(video, stream);
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