const { withMainApplication } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

module.exports = (config) => withMainApplication(config, (mod) => {
  const language = mod.modResults.language;
  if (language !== "java" && language !== "kt") {
    throw new Error(`Screen sharing requires a Java or Kotlin MainApplication, got ${language}`);
  }
  mod.modResults.contents = mergeContents({
    src: mod.modResults.contents,
    newSrc: `    com.oney.WebRTCModule.WebRTCModuleOptions.getInstance().enableMediaProjectionService = true${language === "java" ? ";" : ""}`,
    tag: "looptalk-screen-sharing",
    anchor: /super\.onCreate\(\)/,
    offset: 1,
    comment: "//",
  }).contents;
  return mod;
});
