import React, { useEffect, useRef } from "react";
import { attachMediaPlayback } from "../utils/mediaPlayback";

export const RemoteAudio = ({ stream, onPlaybackBlocked, playbackAttempt = 0 }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) return undefined;
    return attachMediaPlayback(audioRef.current, stream, onPlaybackBlocked);
  }, [stream, onPlaybackBlocked, playbackAttempt]);

  return React.createElement("audio", {
    ref: audioRef,
    autoPlay: true,
    playsInline: true,
    style: { display: "none" },
  });
};