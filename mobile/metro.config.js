const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const repositoryRoot = path.resolve(__dirname, "..");
config.watchFolders = [...config.watchFolders, repositoryRoot];
config.server.unstable_serverRoot = repositoryRoot;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^react(?:-dom)?(?:\/|$)/.test(moduleName)) {
    return context.resolveRequest({
      ...context,
      originModulePath: path.join(__dirname, "package.json"),
    }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
