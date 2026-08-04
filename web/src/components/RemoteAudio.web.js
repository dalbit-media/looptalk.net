import React, { useEffect, useRef } from "react";

export const RemoteAudio = ({ stream }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) return undefined;
    audioRef.current.srcObject = stream || null;
    if (stream) audioRef.current.play().catch(() => {});
    return () => {
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [stream]);

  return React.createElement("audio", {
    ref: audioRef,
    autoPlay: true,
    playsInline: true,
    style: { display: "none" },
  });
};