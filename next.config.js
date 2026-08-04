/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "react-native-web",
    "react-native-gesture-handler",
    "react-native-safe-area-context",
    "react-native-screens",
    "react-native-svg",
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "@react-navigation/bottom-tabs",
  ],
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "react-native": "react-native-web",
    },
  },
  webpack: (config, { dev, webpack }) => {
    const path = require("node:path");
    const expoFontServerContext = path.resolve(
      __dirname,
      "mobile/src/utils/expoFontServerContext.web.js"
    );
    config.resolve.alias["react-native$"] = "react-native-web";
    config.resolve.alias["react-native-reanimated"] = false;
    config.resolve.alias[
      path.resolve(__dirname, "node_modules/expo-font/build/serverContext.web.js")
    ] = expoFontServerContext;
    config.resolve.alias[
      path.resolve(__dirname, "mobile/node_modules/expo-font/build/serverContext.web.js")
    ] = expoFontServerContext;
    config.resolve.extensions = [
      ".web.js",
      ".web.jsx",
      ".web.ts",
      ".web.tsx",
      ...config.resolve.extensions,
    ];
    config.module.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      include: [
        path.resolve(__dirname, "mobile"),
        path.resolve(__dirname, "node_modules/@expo/vector-icons"),
        path.resolve(__dirname, "node_modules/expo"),
        path.resolve(__dirname, "node_modules/expo-modules-core"),
        path.resolve(__dirname, "node_modules/expo-image-picker"),
      ],
      use: {
        loader: "babel-loader",
        options: { presets: ["babel-preset-expo"], cacheDirectory: true },
      },
    });
    config.module.rules.push({
      test: /\.(ttf|otf)$/,
      type: "asset/resource",
    });
    config.plugins.push(new webpack.DefinePlugin({
      __DEV__: JSON.stringify(dev),
    }));
    return config;
  },
};

module.exports = nextConfig;