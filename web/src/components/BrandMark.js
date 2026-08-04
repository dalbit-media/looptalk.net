import React from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

export const BrandMark = ({ size = 64 }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    accessibilityLabel="LoopTalk"
    role="img"
  >
    <Defs>
      <LinearGradient id="loopA" x1="10" y1="10" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#087BEF" />
        <Stop offset="0.5" stopColor="#3758E8" />
        <Stop offset="1" stopColor="#7847D6" />
      </LinearGradient>
      <LinearGradient id="loopB" x1="54" y1="18" x2="18" y2="56" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#D92D78" />
        <Stop offset="0.5" stopColor="#EF4444" />
        <Stop offset="1" stopColor="#C2410C" />
      </LinearGradient>
    </Defs>
    <Path
      d="M11 28v-6c0-7 5-12 12-12h16c7 0 12 5 12 12v5c0 7-5 12-12 12H28L17 48l3-10c-5-1-9-5-9-10Z"
      fill="none"
      stroke="url(#loopA)"
      strokeWidth="5.5"
      strokeDasharray="10 2"
      strokeLinecap="butt"
      strokeLinejoin="round"
    />
    <Path
      d="M18 36v-6c0-7 5-12 12-12h13c7 0 12 5 12 12v8c0 6-5 11-11 11h-3l8 7-13-7h-6c-7 0-12-5-12-13Z"
      fill="none"
      stroke="url(#loopB)"
      strokeWidth="5.5"
      strokeDasharray="10 2"
      strokeLinecap="butt"
      strokeLinejoin="round"
      strokeDashoffset="5"
    />
  </Svg>
);