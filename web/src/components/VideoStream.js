import React from "react";
import { RTCView } from "../utils/webrtc";

export const VideoStream = ({ stream, style, objectFit = "cover", mirror = false }) => {
  if (!stream) return null;
  return (
    <RTCView
      streamURL={stream.toURL()}
      style={style}
      objectFit={objectFit}
      mirror={mirror}
    />
  );
};