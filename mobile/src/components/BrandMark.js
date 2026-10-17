import React from "react";
import { Image } from "react-native";

const asset = require("../../assets/logo.png");
const logo = asset.default || asset;
const source = logo.src ? { uri: logo.src } : logo;

export const BrandMark = ({ size = 64 }) => (
  <Image
    source={source}
    style={{ width: size, height: size }}
    resizeMode="contain"
    accessibilityLabel="LoopTalk"
    accessible
    role="img"
  />
);
